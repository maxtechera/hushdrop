// Who can open a hosted drop, and per-recipient links.
//   GET    /api/recipients?slug=s                  → { allow, block, links: [{ token, label, url, views, last_viewed_at, revoked }] }
//   POST   /api/recipients { slug, allow?, block? } → set allow/block lists (Pro). [] clears.
//   POST   /api/recipients { slug, link: "Ann" }   → mint a named guest link for one recipient (Pro)
//   DELETE /api/recipients?token=<t>               → revoke one guest link (Free)
import { randomBytes } from "node:crypto";
import { admin } from "./_lib/supabase.mjs";
import { userFromRequest } from "./_lib/auth.mjs";
import { hasPro, UPGRADE } from "./_lib/plan.mjs";
import { normList } from "./_lib/recipients.mjs";
import { capture, reqProps } from "./_posthog.mjs";

export default async function handler(req, res) {
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: "not authenticated — run `hush login`" });
  const db = admin();
  const host = req.headers["x-forwarded-host"] || req.headers.host || "hushdrop.dev";
  const q = (k) => req.query?.[k] || new URL(req.url, "http://x").searchParams.get(k);
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } } b = b || {};

  if (req.method === "DELETE") {
    const token = String(q("token") || b.token || "");
    const { data } = await db.from("share_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", user.user_id).eq("token", token).is("revoked_at", null).select("slug").maybeSingle();
    if (!data) return res.status(404).json({ error: "no such active link" });
    await capture({ distinctId: user.user_id, event: "share_link_revoked", properties: { slug: data.slug, single: true, ...reqProps(req) } });
    return res.status(200).json({ revoked: token, slug: data.slug });
  }

  const slug = String(q("slug") || b.slug || "").trim();
  if (!slug) return res.status(400).json({ error: "slug required" });
  const { data: site, error } = await db.from("sites").select("*").eq("user_id", user.user_id).eq("slug", slug).maybeSingle();
  if (error || !site) return res.status(404).json({ error: "no such drop" });

  if (req.method === "GET") {
    const { data: links } = await db.from("share_tokens").select("*").eq("user_id", user.user_id).eq("slug", slug).order("created_at", { ascending: false });
    return res.status(200).json({
      slug, allow: site.allow_emails || [], block: site.block_emails || [],
      links: (links || []).map((t) => ({ token: t.token, label: t.label || null, url: `https://${host}/s/${t.token}`, views: Number(t.views || 0), last_viewed_at: t.last_viewed_at || null, revoked: !!t.revoked_at, created_at: t.created_at })),
    });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "GET, POST or DELETE" });

  if (!(await hasPro(user.user_id))) {
    await capture({ distinctId: user.user_id, event: "paywall_hit", properties: { gate: b.link ? "named_links" : "allow_block", ...reqProps(req) } });
    return res.status(402).json({ error: b.link ? "Named links per recipient are a Pro feature" : "Allow and block lists are a Pro feature", ...UPGRADE });
  }

  if (b.link) {
    const label = String(b.link).trim().slice(0, 80);
    const token = randomBytes(12).toString("hex");
    const { error: ie } = await db.from("share_tokens").insert({ token, user_id: user.user_id, handle: site.handle, slug, label });
    if (ie) return res.status(503).json({ error: "could not mint link (migration 0014 pending?)" });
    await capture({ distinctId: user.user_id, event: "share_link_created", properties: { slug, named: true, ...reqProps(req) } });
    return res.status(200).json({ token, label, url: `https://${host}/s/${token}`, slug });
  }

  const patch = {};
  if ("allow" in b) patch.allow_emails = normList(b.allow);
  if ("block" in b) patch.block_emails = normList(b.block);
  if (!Object.keys(patch).length) return res.status(400).json({ error: "send allow, block, or link" });
  for (const k of Object.keys(patch)) if (!patch[k].length) patch[k] = null;
  const { error: ue } = await db.from("sites").update(patch).eq("id", site.id);
  if (ue) return res.status(503).json({ error: "could not update (migration 0014 pending?)" });
  await capture({ distinctId: user.user_id, event: "recipient_lists_set", properties: { slug, allow: (patch.allow_emails || []).length, block: (patch.block_emails || []).length, ...reqProps(req) } });
  return res.status(200).json({ slug, allow: patch.allow_emails ?? site.allow_emails ?? [], block: patch.block_emails ?? site.block_emails ?? [] });
}
