// Publish endpoint — serves two tiers from one route:
//
//   • Anonymous (no auth)  → zero-setup managed tier. Stored under `u/<slug>`,
//     512 KB cap, html/markdown only, auto-deleted after 24h by api/gc.
//   • Hosted (Bearer key)  → logged-in free tier. Stored persistently under
//     `<handle>/<slug>`, larger cap, a `sites` row is written, quota enforced.
//     The existing edge middleware already proxies `<handle>/<slug>` from Blob
//     with noindex, so no routing change is needed.
//
// The CLI does all branding + AES-256 encryption CLIENT-SIDE, then POSTs the final
// bytes here, so BOTH tiers stay zero-knowledge — the server only ever sees ciphertext.
//
// Safety: size caps, html/text only, namespacing, kill switch (DROP_MANAGED_DISABLED).

import { put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { admin, userFromKey } from "./_lib/supabase.mjs";
import { bearer } from "./_lib/keys.mjs";
import { rateLimit, clientIp } from "./_lib/ratelimit.mjs";

const MAX_ANON = 512 * 1024;        // 512 KB per anonymous managed drop
const MAX_HOSTED = 5 * 1024 * 1024; // 5 MB per hosted drop
const ALPH = "23456789abcdefghjkmnpqrstuvwxyz";

// Per-plan ceilings for the hosted tier (count of live sites + total bytes).
const PLAN = {
  free: { sites: 100, bytes: 100 * 1024 * 1024 },
  pro:  { sites: 100000, bytes: 5 * 1024 * 1024 * 1024 },
};

function slugId(n = 10) {
  const b = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += ALPH[b[i] % ALPH.length];
  return s;
}

// Normalize a user-supplied slug to a safe single path segment.
function cleanSlug(raw) {
  const s = String(raw || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return s || slugId();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (process.env.DROP_MANAGED_DISABLED) return res.status(503).json({ error: "publishing is paused" });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(500).json({ error: "server not configured" });

  // Hosted tier? Resolve the Bearer key up-front (null for the anonymous tier).
  const key = bearer(req);
  const user = key ? await userFromKey(key) : null;
  if (key && !user) return res.status(401).json({ error: "invalid or revoked API key — run `hush login`" });
  if (user && !user.handle) return res.status(409).json({ error: "account has no handle yet — run `hush login` to pick one" });
  const hosted = !!user;

  // Per-IP rate limit on the anonymous (unauthenticated) write path — the open
  // endpoint to the host's Blob. Authenticated/hosted writes are quota-bounded instead.
  if (!hosted) {
    const rl = await rateLimit(`publish:${clientIp(req)}`, { limit: 20, windowSec: 86400 });
    if (!rl.ok) return res.status(429).json({ error: "rate limit exceeded — try again later, or self-host for unlimited" });
  }

  const ct = String(req.headers["x-drop-content-type"] || "text/html; charset=utf-8");
  if (!/^(text\/html|text\/plain|text\/markdown)/i.test(ct)) {
    return res.status(415).json({ error: "this tier accepts HTML/markdown only — self-host ('hush deploy') for other file types" });
  }

  // read the raw body with a hard size cap
  const cap = hosted ? MAX_HOSTED : MAX_ANON;
  const chunks = [];
  let size = 0;
  try {
    for await (const c of req) {
      size += c.length;
      if (size > cap) return res.status(413).json({ error: `too large (max ${cap} bytes on this tier; self-host for more)` });
      chunks.push(c);
    }
  } catch {
    return res.status(400).json({ error: "could not read body" });
  }
  let body = Buffer.concat(chunks);
  if (!body.length) return res.status(400).json({ error: "empty body" });

  // Web uploads (x-drop-brand) aren't pre-branded by the CLI — inject a minimal badge + favicon.
  if (req.headers["x-drop-brand"] && /^text\/html/i.test(ct)) {
    let html = body.toString("utf8");
    const badge = `<a href="https://hushdrop.dev" target="_blank" rel="noopener" style="position:fixed;right:14px;bottom:14px;z-index:2147483646;padding:7px 12px;border-radius:999px;text-decoration:none;font:600 12px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff;background:rgba(20,20,22,.62);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(12px)">hushdrop.dev</a>`;
    const meta = `<link rel="icon" href="https://hushdrop.dev/_brand/favicon.png"/><meta name="theme-color" content="#ff6b35"/>`;
    html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${meta}</head>`) : meta + html;
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${badge}</body>`) : html + badge;
    body = Buffer.from(html, "utf8");
  }

  const host = req.headers["x-forwarded-host"] || req.headers.host || "hushdrop.dev";

  // ---- Hosted tier: persistent <handle>/<slug> + sites row + quota ----
  if (hosted) {
    const db = admin();
    const { data: prof } = await db.from("profiles").select("plan").eq("user_id", user.user_id).maybeSingle();
    const limits = PLAN[prof?.plan] || PLAN.free;
    const slug = cleanSlug(req.headers["x-drop-slug"]);
    const blobKey = `${user.handle}/${slug}`;

    // Quota: a same-slug publish is a redeploy (overwrite), so exclude it from counts.
    const { data: existing } = await db.from("sites").select("slug, size_bytes").eq("user_id", user.user_id);
    const others = (existing || []).filter((s) => s.slug !== slug);
    const isNew = !(existing || []).some((s) => s.slug === slug);
    const usedBytes = others.reduce((n, s) => n + (s.size_bytes || 0), 0);
    if (isNew && others.length + 1 > limits.sites) {
      return res.status(402).json({ error: `site limit reached (${limits.sites} on your plan) — delete one or upgrade` });
    }
    if (usedBytes + body.length > limits.bytes) {
      return res.status(402).json({ error: `storage limit reached (${Math.round(limits.bytes / 1048576)} MB on your plan)` });
    }

    try {
      await put(blobKey, body, { access: "public", token, addRandomSuffix: false, allowOverwrite: true, contentType: ct });
    } catch {
      return res.status(502).json({ error: "upload failed" });
    }
    const locked = req.headers["x-drop-locked"] === "1";
    const emailGate = req.headers["x-drop-email-gate"] ? String(req.headers["x-drop-email-gate"]).toLowerCase() : null;
    await db.from("sites").upsert({
      slug, handle: user.handle, user_id: user.user_id, blob_key: blobKey,
      content_type: ct, size_bytes: body.length, locked, expires_at: null, email_gate: emailGate,
    }, { onConflict: "handle,slug" });
    return res.status(200).json({ url: `https://${host}/${user.handle}/${slug}`, slug, handle: user.handle, hosted: true, email_gate: emailGate });
  }

  // ---- Burn-after-read (anonymous): content stored inline in DB, served+deleted
  // atomically by api/burn on first view. URL stays under /u/ so it auto-GCs too. ----
  if (req.headers["x-drop-burn"]) {
    const slug = `burn-${slugId(8)}`;
    const { error } = await admin().from("burn_drops").insert({ slug, content: body.toString("utf8"), content_type: ct });
    if (error) return res.status(502).json({ error: "could not create burn drop" });
    return res.status(200).json({ url: `https://${host}/u/${slug}`, slug, burn: true });
  }

  // ---- Anonymous managed tier: ephemeral u/<slug>, 24h GC ----
  const slug = `u/${slugId()}`;
  try {
    await put(slug, body, { access: "public", token, addRandomSuffix: false, contentType: ct });
  } catch {
    return res.status(502).json({ error: "upload failed" });
  }
  return res.status(200).json({ url: `https://${host}/${slug}`, slug, expires: "24h" });
}
