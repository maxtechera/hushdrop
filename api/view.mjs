// Internal: records one HTML view of a hosted drop. Called by the edge middleware
// (fire-and-forget, after the response is already streaming), never by browsers.
//
//   POST /api/view  { handle, slug, viewer, country, referrer, mobile }
//   header x-hush-internal: <HUSH_GATE_SECRET>
//
// Returns { recorded, first_view, new_viewer }. A missing table/migration or an unknown
// drop returns 200 { recorded:false } so the edge never retries or errors.
import { admin } from "./_lib/supabase.mjs";
import { internalOk } from "./_lib/internal.mjs";
import { emitDropEvent } from "./_lib/drop-events.mjs";

const seg = (s) => typeof s === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(s);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!internalOk(req)) return res.status(401).json({ error: "internal only" });
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  if (!seg(b.handle) || !seg(b.slug) || b.handle === "u") return res.status(200).json({ recorded: false });

  const { data, error } = await admin().rpc("record_drop_view", {
    p_handle: b.handle,
    p_slug: b.slug,
    p_viewer: String(b.viewer || "anon").slice(0, 40),
    p_country: b.country ? String(b.country).slice(0, 2) : null,
    p_referrer: b.referrer ? String(b.referrer).slice(0, 120) : null,
    p_mobile: !!b.mobile,
    p_email: null,
  });
  if (error || !data) return res.status(200).json({ recorded: false });

  const ev = { ...data, country: b.country || null, referrer: b.referrer || null };
  await emitDropEvent("drop.viewed", ev);
  if (data.first_view) await emitDropEvent("drop.first_opened", ev);
  return res.status(200).json({ recorded: true, first_view: data.first_view, new_viewer: data.new_viewer });
}
