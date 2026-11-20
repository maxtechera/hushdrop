import { verifyPassword } from "./_lib/gate.mjs";
import { signCookie } from "./_lib/cookie.mjs";
import { renderUnlockPage } from "./_lib/unlock-page.mjs";
import { capture } from "./_posthog.mjs";

const DEFAULT_BLOB_HOST = "opzwhnf3xlqxnotd.public.blob.vercel-storage.com";
function blobBase() {
  const sid = (process.env.BLOB_READ_WRITE_TOKEN || "").split("_")[3];
  return `https://${sid ? `${sid.toLowerCase()}.public.blob.vercel-storage.com` : DEFAULT_BLOB_HOST}`;
}
const validSlug = (s) => typeof s === "string" && /^[a-z0-9][a-z0-9-]*$/.test(s);

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const c of req) raw += c;
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("application/json")) { try { return JSON.parse(raw); } catch { return {}; } }
  return Object.fromEntries(new URLSearchParams(raw));
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.statusCode = 405; return res.end("Method not allowed"); }
  const secret = process.env.HUSH_GATE_SECRET;
  if (!secret) { res.statusCode = 503; return res.end("gate misconfigured"); }

  const body = await readBody(req);
  const slug = String(body.slug || "");
  if (!validSlug(slug)) { res.statusCode = 400; return res.end("bad slug"); }
  const password = String(body.password || "");
  // next must be a path under this slug AND free of CRLF (header-injection defense-in-depth,
  // independent of the runtime's own Location handling).
  const next = typeof body.next === "string" && body.next.startsWith(`/${slug}/`) && !/[\r\n]/.test(body.next)
    ? body.next : `/${slug}/`;

  const r = await fetch(`${blobBase()}/${slug}/.hush.json`);
  if (!r.ok) { res.statusCode = 404; return res.end("no such protected site"); }
  const verifier = await r.json().catch(() => null);

  if (!(await verifyPassword(verifier, password))) {
    res.statusCode = 401;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("x-robots-tag", "noindex, nofollow");
    return res.end(renderUnlockPage({ slug, next, brand: verifier && verifier.brand, error: "Wrong password." }));
  }
  const cookie = await signCookie(slug, secret);
  await capture({
    distinctId: slug,
    event: "drop_unlocked",
    properties: { slug },
  });
  res.statusCode = 302;
  res.setHeader("Set-Cookie", `hush_${slug}=${cookie}; HttpOnly; Secure; SameSite=Lax; Path=/${slug}/; Max-Age=604800`);
  res.setHeader("Location", next);
  return res.end();
}
