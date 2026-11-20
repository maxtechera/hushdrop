// Manage webhooks (Pro).
//   GET    /api/webhooks                       → { webhooks: [...] }  (secrets hidden)
//   POST   /api/webhooks { url, events?, slug? } → { id, secret, ... }  (secret shown once)
//   POST   /api/webhooks { id, test: true }    → sends a signed test event, returns its status
//   DELETE /api/webhooks?id=<id>               → { removed }
import { admin } from "./_lib/supabase.mjs";
import { userFromRequest } from "./_lib/auth.mjs";
import { hasPro, UPGRADE } from "./_lib/plan.mjs";
import { EVENTS, badUrl, newSecret, deliver } from "./_lib/webhooks.mjs";
import { capture, reqProps } from "./_posthog.mjs";

const MAX_HOOKS = 20;
const pub = (h, slugs) => ({ id: h.id, url: h.url, events: h.events, slug: h.site_id ? slugs.get(h.site_id) || null : null, created_at: h.created_at, last_delivery_at: h.last_delivery_at, last_status: h.last_status, disabled: !!h.disabled_at });

export default async function handler(req, res) {
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: "not authenticated — run `hush login`" });
  const db = admin();
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const q = (k) => req.query?.[k] || new URL(req.url, "http://x").searchParams.get(k);

  const { data: sites } = await db.from("sites").select("id, slug").eq("user_id", user.user_id);
  const slugs = new Map((sites || []).map((s) => [s.id, s.slug]));

  if (req.method === "GET") {
    const { data, error } = await db.from("webhooks").select("*").eq("user_id", user.user_id).order("created_at");
    if (error) return res.status(503).json({ error: "webhooks not available yet (migration 0011 pending)" });
    return res.status(200).json({ webhooks: (data || []).map((h) => pub(h, slugs)), events: EVENTS });
  }

  if (req.method === "DELETE") {
    const id = String(q("id") || body.id || "");
    const { data } = await db.from("webhooks").delete().eq("user_id", user.user_id).eq("id", id).select("id").maybeSingle();
    if (!data) return res.status(404).json({ error: "no such webhook" });
    await capture({ distinctId: user.user_id, event: "webhook_deleted", properties: reqProps(req) });
    return res.status(200).json({ removed: id });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "GET, POST or DELETE" });

  if (!(await hasPro(user.user_id))) {
    await capture({ distinctId: user.user_id, event: "paywall_hit", properties: { gate: "webhooks", ...reqProps(req) } });
    return res.status(402).json({ error: "Webhooks are a Pro feature", ...UPGRADE });
  }

  if (body.test) {
    const { data: h } = await db.from("webhooks").select("*").eq("user_id", user.user_id).eq("id", String(body.id || "")).maybeSingle();
    if (!h) return res.status(404).json({ error: "no such webhook" });
    const r = await deliver(h, "drop.first_opened", { test: true, handle: user.handle, slug: "example", url: `https://hushdrop.dev/${user.handle}/example`, views: 1, country: "US", referrer: "slack.com" });
    await db.from("webhooks").update({ last_delivery_at: new Date().toISOString(), last_status: r.status }).eq("id", h.id);
    return res.status(200).json({ delivered: r.ok, status: r.status, error: r.error || null });
  }

  const url = String(body.url || "").trim();
  const err = badUrl(url);
  if (err) return res.status(400).json({ error: err });
  const events = Array.isArray(body.events) && body.events.length ? body.events : ["drop.first_opened", "lead.captured"];
  if (events.some((e) => !EVENTS.includes(e))) return res.status(400).json({ error: `events must be from: ${EVENTS.join(", ")}` });
  let site_id = null;
  if (body.slug) {
    site_id = [...slugs.entries()].find(([, s]) => s === body.slug)?.[0];
    if (!site_id) return res.status(404).json({ error: "no such drop" });
  }
  const { count } = await db.from("webhooks").select("id", { count: "exact", head: true }).eq("user_id", user.user_id);
  if ((count || 0) >= MAX_HOOKS) return res.status(400).json({ error: `limit of ${MAX_HOOKS} webhooks` });
  const secret = newSecret();
  const { data: h, error: ie } = await db.from("webhooks").insert({ user_id: user.user_id, site_id, url, secret, events }).select("*").single();
  if (ie) return res.status(503).json({ error: "could not create webhook (migration 0011 pending?)" });
  await capture({ distinctId: user.user_id, event: "webhook_created", properties: { events, per_drop: !!site_id, ...reqProps(req) } });
  return res.status(200).json({ ...pub(h, slugs), secret });
}
