// Admin dashboard data — GET /api/admin (Bearer = Supabase session JWT).
//
// Access: the signed-in user's handle must be in ADMIN_HANDLES (default: max). Reads with the service role; returns metadata only
// (counts, slugs, sizes, emails). Drop contents are ciphertext and never read here.
//
// Returns 180 days of daily series so the page can switch 7/30/90-day ranges and
// compare against the previous period without another round-trip.

import { list } from "@vercel/blob";
import { requireAdmin } from "./_lib/adminauth.mjs";

const DAYS = 180;
const ROW_CAP = 2000;
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

function lastDays(n) {
  const out = [];
  const t = Date.now();
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(t - i * 86400000));
  return out;
}

function perDay(rows, field, days) {
  const m = Object.fromEntries(days.map((d) => [d, 0]));
  for (const r of rows) {
    const k = r[field] && dayKey(r[field]);
    if (k in m) m[k]++;
  }
  return days.map((d) => m[d]);
}

async function allUsers(db) {
  const users = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function anonBlobs(token) {
  const blobs = [];
  let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await list({ token, prefix: "u/", cursor, limit: 1000 });
    blobs.push(...r.blobs);
    if (!r.hasMore) break;
    cursor = r.cursor;
  }
  return blobs;
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-robots-tag", "noindex, nofollow");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const ok = await requireAdmin(req, res);
  if (!ok) return;
  const { db } = ok;
  const q = (p) => p.then(({ data, error }) => { if (error) throw error; return data || []; });
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [users, profiles, sites, keys, burns, shares, limits, anon] = await Promise.all([
      allUsers(db),
      q(db.from("profiles").select("user_id, handle, plan, created_at")),
      q(db.from("sites").select("slug, handle, user_id, size_bytes, locked, views, expires_at, email_gate, feedback, created_at").order("created_at", { ascending: false }).limit(10000)),
      q(db.from("api_keys").select("user_id, created_at, last_used_at, revoked_at")),
      q(db.from("burn_drops").select("slug, created_at")),
      q(db.from("share_tokens").select("slug, handle, revoked_at, created_at")),
      q(db.from("rate_limits").select("key, count, window_start").gte("window_start", since).order("count", { ascending: false }).limit(20)),
      process.env.BLOB_READ_WRITE_TOKEN ? anonBlobs(process.env.BLOB_READ_WRITE_TOKEN) : Promise.resolve([]),
    ]);

    const now = Date.now();
    const days = lastDays(DAYS);
    const prof = Object.fromEntries(profiles.map((p) => [p.user_id, p]));
    const agg = {};
    for (const s of sites) {
      const a = (agg[s.user_id] ||= { sites: 0, bytes: 0, views: 0, last: null });
      a.sites++; a.bytes += Number(s.size_bytes || 0); a.views += Number(s.views || 0);
      if (!a.last || s.created_at > a.last) a.last = s.created_at;
    }
    const keyBy = {};
    for (const k of keys) if (!k.revoked_at) {
      const a = (keyBy[k.user_id] ||= { keys: 0, lastUsed: null });
      a.keys++; if (k.last_used_at && (!a.lastUsed || k.last_used_at > a.lastUsed)) a.lastUsed = k.last_used_at;
    }
    const activeKeys = keys.filter((k) => !k.revoked_at);
    const liveSites = sites.filter((s) => !s.expires_at || new Date(s.expires_at).getTime() > now);
    const firstKeyAt = {};
    for (const k of keys) if (!firstKeyAt[k.user_id] || k.created_at < firstKeyAt[k.user_id]) firstKeyAt[k.user_id] = k.created_at;
    const viewed = new Set(sites.filter((s) => (s.views || 0) > 0).map((s) => s.user_id));
    const providers = {};
    for (const u of users) { const p = u.app_metadata?.provider || "email"; providers[p] = (providers[p] || 0) + 1; }

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      totals: {
        users: users.length,
        withHandle: profiles.filter((p) => p.handle).length,
        proUsers: profiles.filter((p) => p.plan === "pro").length,
        activeKeys: activeKeys.length,
        keysUsed7d: activeKeys.filter((k) => k.last_used_at && now - new Date(k.last_used_at).getTime() < 7 * 86400000).length,
        hostedSites: liveSites.length,
        hostedBytes: sites.reduce((a, s) => a + Number(s.size_bytes || 0), 0),
        views: sites.reduce((a, s) => a + Number(s.views || 0), 0),
        anonLive: anon.length,
        anonBytes: anon.reduce((a, b) => a + (b.size || 0), 0),
        burnPending: burns.length,
        shareTokensActive: shares.filter((s) => !s.revoked_at).length,
        emailGated: sites.filter((s) => s.email_gate).length,
        locked: sites.filter((s) => s.locked).length,
        expiring7d: sites.filter((s) => s.expires_at && new Date(s.expires_at).getTime() > now && new Date(s.expires_at).getTime() - now < 7 * 86400000).length,
      },
      funnel: [
        { label: "Signed up", value: users.length },
        { label: "Picked a handle", value: profiles.filter((p) => p.handle).length },
        { label: "Created an API key", value: Object.keys(firstKeyAt).length },
        { label: "Published a hosted drop", value: Object.keys(agg).length },
        { label: "Got a view", value: viewed.size },
      ],
      providers: Object.entries(providers).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
      series: {
        days,
        signups: perDay(users, "created_at", days),
        hosted: perDay(sites, "created_at", days),
        keys: perDay(keys, "created_at", days),
        shares: perDay(shares, "created_at", days),
      },
      users: users
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, ROW_CAP)
        .map((u) => ({
          id: u.id,
          email: u.email,
          handle: prof[u.id]?.handle || null,
          plan: prof[u.id]?.plan || "free",
          provider: u.app_metadata?.provider || "email",
          sites: agg[u.id]?.sites || 0,
          bytes: agg[u.id]?.bytes || 0,
          views: agg[u.id]?.views || 0,
          lastDrop: agg[u.id]?.last || null,
          keys: keyBy[u.id]?.keys || 0,
          keyLastUsed: keyBy[u.id]?.lastUsed || null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
        })),
      sites: sites.slice(0, ROW_CAP).map((s) => ({
        user_id: s.user_id, url: `/${s.handle}/${s.slug}`, handle: s.handle, slug: s.slug, size: Number(s.size_bytes || 0),
        locked: s.locked, views: Number(s.views || 0), email_gate: s.email_gate, feedback: s.feedback, expires_at: s.expires_at, created_at: s.created_at,
      })),
      anon: { count: anon.length, bytes: anon.reduce((a, b) => a + (b.size || 0), 0), oldest: anon.reduce((m, b) => (!m || b.uploadedAt < m ? b.uploadedAt : m), null) },
      rateLimits: limits.map((l) => ({ key: l.key.replace(/(\d+\.\d+)\.\d+\.\d+$/, "$1.x.x"), count: l.count, window_start: l.window_start })),
    });
  } catch (e) {
    console.error("admin:", e);
    return res.status(500).json({ error: "query failed", detail: String(e?.message || e) });
  }
}
