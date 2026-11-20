// Drop analytics for the owner — "opened yet?" plus views over time.
//
//   GET /api/stats                → { drops: [{ slug, url, views, unique_viewers, first_viewed_at, last_viewed_at, opened }] }
//   GET /api/stats?slug=<slug>    → one drop: counters + daily views (Free);
//                                   referrers, countries, viewing_now, recent views (Pro)
//
// Auth: API key (CLI/MCP) or dashboard session. Only the drop's owner can read it.
import { admin } from "./_lib/supabase.mjs";
import { userFromRequest } from "./_lib/auth.mjs";
import { hasPro, UPGRADE } from "./_lib/plan.mjs";
import { aggregate } from "./_lib/stats.mjs";
import { capture, reqProps } from "./_posthog.mjs";

const COLS = "id, slug, handle, views, unique_viewers, first_viewed_at, last_viewed_at, created_at";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: "not authenticated — run `hush login`" });
  const db = admin();
  const host = req.headers["x-forwarded-host"] || req.headers.host || "hushdrop.dev";
  const slug = String(req.query?.slug || new URL(req.url, "http://x").searchParams.get("slug") || "").trim();
  const shape = (s) => ({
    slug: s.slug,
    url: `https://${host}/${s.handle}/${s.slug}`,
    views: Number(s.views || 0),
    unique_viewers: Number(s.unique_viewers || 0),
    first_viewed_at: s.first_viewed_at || null,
    last_viewed_at: s.last_viewed_at || null,
    opened: !!s.first_viewed_at,
  });

  if (!slug) {
    const { data, error } = await db.from("sites").select(COLS).eq("user_id", user.user_id).order("created_at", { ascending: false });
    if (error) return res.status(503).json({ error: "stats not available yet (migration 0010 pending)" });
    return res.status(200).json({ drops: (data || []).map(shape) });
  }

  const { data: site, error } = await db.from("sites").select(COLS).eq("user_id", user.user_id).eq("slug", slug).maybeSingle();
  if (error) return res.status(503).json({ error: "stats not available yet (migration 0010 pending)" });
  if (!site) return res.status(404).json({ error: "no such drop" });
  const pro = await hasPro(user.user_id);
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data: rows } = await db.from("drop_views")
    .select("viewer, country, referrer, is_mobile, email, created_at")
    .eq("site_id", site.id).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(5000);
  await capture({ distinctId: user.user_id, event: "drop_stats_viewed", properties: { slug, pro, ...reqProps(req) } });
  return res.status(200).json({
    ...shape(site),
    ...aggregate(rows || [], { pro }),
    ...(pro ? {} : { pro_only: ["referrers", "countries", "viewing_now", "recent"], ...UPGRADE }),
  });
}
