// Admin: a user's journey from PostHog (Hushdrop project) via saved endpoints.
//   GET /api/admin-journey?uid=<supabase user id>  → { profile, timeline, links }
//   GET /api/admin-journey?overview=1              → { overview: { <kind>: [{label,value}] } } (last 30d)
//   GET /api/admin-journey?sources=1               → { sources: { <uid>: { source, campaign, landing_path, country } } }
// Needs POSTHOG_PERSONAL_API_KEY (query read on project 485925). Endpoints are defined
// in PostHog: hushdrop_user_profile, hushdrop_user_timeline, hushdrop_user_sources.
import { requireAdmin } from "./_lib/adminauth.mjs";

const PROJECT = process.env.POSTHOG_PROJECT_ID || "485925";
const HOST = "https://us.posthog.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function run(name, variables) {
  const r = await fetch(`${HOST}/api/projects/${PROJECT}/endpoints/${name}/run`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(variables ? { variables } : {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${name}: ${r.status} ${d.detail || d.error || ""}`.trim());
  const cols = d.columns || [];
  return (d.results || []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const ok = await requireAdmin(req, res);
  if (!ok) return;
  if (!process.env.POSTHOG_PERSONAL_API_KEY) return res.status(503).json({ error: "analytics not connected", detail: "Set POSTHOG_PERSONAL_API_KEY in Vercel." });

  const url = new URL(req.url, "https://x");
  try {
    if (url.searchParams.get("overview")) {
      const rows = await run("hushdrop_overview");
      const out = {};
      for (const r of rows) (out[r.kind] ||= []).push({ label: r.label, value: Number(r.value) || 0 });
      for (const k of Object.keys(out)) if (k !== "view_day") out[k].sort((a, b) => b.value - a.value);
      return res.status(200).json({ overview: out });
    }
    if (url.searchParams.get("sources")) {
      const rows = await run("hushdrop_user_sources");
      return res.status(200).json({ sources: Object.fromEntries(rows.map((r) => [r.uid, { source: r.source, campaign: r.campaign, landing_path: r.landing_path, country: r.country }])) });
    }
    const uid = String(url.searchParams.get("uid") || "");
    if (!UUID.test(uid)) return res.status(400).json({ error: "uid must be a user id" });
    const [profile, timeline] = await Promise.all([
      run("hushdrop_user_profile", { hushdrop_uid: uid }),
      run("hushdrop_user_timeline", { hushdrop_uid: uid }),
    ]);
    return res.status(200).json({
      profile: profile[0] || null,
      timeline,
      links: {
        person: `${HOST}/project/${PROJECT}/person/${encodeURIComponent(uid)}`,
        recordings: `${HOST}/project/${PROJECT}/person/${encodeURIComponent(uid)}#activeTab=sessionRecordings`,
      },
    });
  } catch (e) {
    console.error("admin-journey:", e);
    return res.status(502).json({ error: "analytics query failed", detail: String(e?.message || e) });
  }
}
