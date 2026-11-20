// Owner side of lead capture.
//   GET  /api/leads?slug=<slug>[&format=csv]     → { leads: [{ email, fields, verified, country, at }] }
//   POST /api/leads { slug, enabled, fields? }   → turn lead capture on/off; fields = custom fields (Pro)
import { admin } from "./_lib/supabase.mjs";
import { userFromRequest } from "./_lib/auth.mjs";
import { hasPro, UPGRADE } from "./_lib/plan.mjs";
import { cleanFields } from "./_lib/lead-page.mjs";
import { capture, reqProps } from "./_posthog.mjs";

const csvCell = (v) => { const s = String(v ?? ""); return /^[=+\-@]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : `"${s.replace(/"/g, '""')}"`; };

export default async function handler(req, res) {
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: "not authenticated — run `hush login`" });
  const db = admin();
  const q = (k) => req.query?.[k] || new URL(req.url, "http://x").searchParams.get(k);
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } } b = b || {};
  const slug = String(q("slug") || b.slug || "").trim();
  if (!slug) return res.status(400).json({ error: "slug required" });
  const { data: site, error } = await db.from("sites").select("id, slug, lead_capture, lead_fields, email_gate").eq("user_id", user.user_id).eq("slug", slug).maybeSingle();
  if (error) return res.status(503).json({ error: "lead capture not available yet (migration 0013 pending)" });
  if (!site) return res.status(404).json({ error: "no such drop" });

  if (req.method === "GET") {
    const { data } = await db.from("leads").select("email, fields, verified, country, created_at").eq("site_id", site.id).order("created_at", { ascending: false }).limit(5000);
    const leads = (data || []).map((l) => ({ email: l.email, fields: l.fields || {}, verified: l.verified, country: l.country, at: l.created_at }));
    await capture({ distinctId: user.user_id, event: "leads_viewed", properties: { slug, count: leads.length, format: q("format") || "json", ...reqProps(req) } });
    if (q("format") === "csv") {
      const cols = [...new Set(leads.flatMap((l) => Object.keys(l.fields)))];
      const rows = [["email", ...cols, "verified", "country", "at"], ...leads.map((l) => [l.email, ...cols.map((c) => l.fields[c]), l.verified, l.country, l.at])];
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("content-disposition", `attachment; filename="${slug}-leads.csv"`);
      return res.status(200).send(rows.map((r) => r.map(csvCell).join(",")).join("\n"));
    }
    return res.status(200).json({ slug, lead_capture: site.lead_capture, fields: site.lead_fields || [], email_gate: site.email_gate, leads });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST" });
  const patch = { lead_capture: b.enabled !== false };
  if ("fields" in b) {
    const fields = cleanFields(b.fields);
    if (fields.length && !(await hasPro(user.user_id))) {
      await capture({ distinctId: user.user_id, event: "paywall_hit", properties: { gate: "lead_fields", ...reqProps(req) } });
      return res.status(402).json({ error: "Custom lead fields are a Pro feature (email-only capture is free)", ...UPGRADE });
    }
    patch.lead_fields = fields.length ? fields : null;
  }
  await db.from("sites").update(patch).eq("id", site.id);
  await capture({ distinctId: user.user_id, event: "lead_capture_set", properties: { slug, enabled: patch.lead_capture, custom_fields: (patch.lead_fields || []).length, ...reqProps(req) } });
  return res.status(200).json({ slug, lead_capture: patch.lead_capture, fields: patch.lead_fields ?? site.lead_fields ?? [] });
}
