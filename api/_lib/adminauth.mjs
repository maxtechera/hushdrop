// Shared admin gate: Bearer Supabase session JWT whose profile handle is in
// ADMIN_HANDLES (comma-separated; default "max"). Returns { me, db } or sends 401/403.
import { admin, userFromJwt } from "./supabase.mjs";
import { bearer } from "./keys.mjs";

export async function requireAdmin(req, res) {
  const allow = String(process.env.ADMIN_HANDLES || "max").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const me = await userFromJwt(bearer(req));
  if (!me) { res.status(401).json({ error: "sign in first" }); return null; }
  const db = admin();
  const { data } = await db.from("profiles").select("handle").eq("user_id", me.id).maybeSingle();
  if (!data?.handle || !allow.includes(data.handle.toLowerCase())) { res.status(403).json({ error: "not an admin" }); return null; }
  return { me, db };
}
