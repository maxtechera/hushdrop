// Open-alert preferences.
//   GET  /api/alerts                    → { mode, email_enabled }
//   POST /api/alerts { mode, slug? }    → set account default, or one drop (slug; mode "default" clears it)
// mode: off | first (Free) | every (Pro: an email per new viewer)
import { admin } from "./_lib/supabase.mjs";
import { userFromRequest } from "./_lib/auth.mjs";
import { hasPro, UPGRADE } from "./_lib/plan.mjs";
import { mailOn } from "./_lib/mail.mjs";
import { capture, reqProps } from "./_posthog.mjs";

const MODES = ["off", "first", "every"];

export default async function handler(req, res) {
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: "not authenticated — run `hush login`" });
  const db = admin();
  if (req.method === "GET") {
    const { data, error } = await db.from("profiles").select("notify_opens").eq("user_id", user.user_id).maybeSingle();
    if (error) return res.status(503).json({ error: "alerts not available yet (migration 0012 pending)" });
    return res.status(200).json({ mode: data?.notify_opens || "first", email_enabled: mailOn() });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST" });
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } } b = b || {};
  const mode = String(b.mode || "");
  const slug = b.slug ? String(b.slug) : null;
  if (!MODES.includes(mode) && !(slug && mode === "default")) return res.status(400).json({ error: `mode must be one of ${MODES.join(", ")}${slug ? ", default" : ""}` });
  if (mode === "every" && !(await hasPro(user.user_id))) {
    await capture({ distinctId: user.user_id, event: "paywall_hit", properties: { gate: "alerts_every", ...reqProps(req) } });
    return res.status(402).json({ error: "An email for every viewer is a Pro feature (first-open alerts are free)", ...UPGRADE });
  }
  if (slug) {
    const { data, error } = await db.from("sites").update({ notify_opens: mode === "default" ? null : mode }).eq("user_id", user.user_id).eq("slug", slug).select("slug").maybeSingle();
    if (error) return res.status(503).json({ error: "alerts not available yet (migration 0012 pending)" });
    if (!data) return res.status(404).json({ error: "no such drop" });
  } else {
    const { error } = await db.from("profiles").update({ notify_opens: mode }).eq("user_id", user.user_id);
    if (error) return res.status(503).json({ error: "alerts not available yet (migration 0012 pending)" });
  }
  await capture({ distinctId: user.user_id, event: "open_alerts_set", properties: { mode, per_drop: !!slug, ...reqProps(req), ...(slug ? {} : { $set: { notify_opens: mode } }) } });
  return res.status(200).json({ mode, slug, email_enabled: mailOn() });
}
