// Handle helper for the sign-in UI:
//   GET  /api/handle?h=<handle>   → { handle, valid, available, reason? }  (public, read-only)
//   POST /api/handle  { jwt }     → { handle }  (the caller's current handle, or null)
// The DB `profiles.handle` UNIQUE constraint is the real collision guard — this endpoint
// only powers advisory availability feedback and "do I already have a handle?" in login.html.
import { admin, userFromJwt } from "./_lib/supabase.mjs";
import { isReservedHandle } from "./_lib/reserved.mjs";

const clean = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
const SHAPE = /^[a-z0-9][a-z0-9-]{1,30}$/;

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");

  if (req.method === "GET") {
    const q = req.query?.h ?? new URL(req.url, "http://x").searchParams.get("h");
    const h = clean(q);
    if (!h) return res.status(200).json({ handle: h, valid: false, available: false, reason: "empty" });
    if (!SHAPE.test(h)) return res.status(200).json({ handle: h, valid: false, available: false, reason: "2–24 chars: letters, numbers, -" });
    if (isReservedHandle(h)) return res.status(200).json({ handle: h, valid: false, available: false, reason: "reserved" });
    const { data } = await admin().from("profiles").select("handle").eq("handle", h).maybeSingle();
    return res.status(200).json({ handle: h, valid: true, available: !data });
  }

  if (req.method === "POST") {
    let raw = "";
    for await (const c of req) raw += c;
    let body;
    try { body = JSON.parse(raw || "{}"); } catch { return res.status(400).json({ error: "bad json" }); }
    const user = await userFromJwt(body.jwt);
    if (!user) return res.status(401).json({ error: "not authenticated" });
    const { data } = await admin().from("profiles").select("handle").eq("user_id", user.id).maybeSingle();
    return res.status(200).json({ handle: data?.handle || null });
  }

  return res.status(405).json({ error: "GET ?h= or POST {jwt}" });
}
