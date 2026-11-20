// One auth entry point for hosted-tier endpoints: an API key (CLI, MCP, CI) or a
// Supabase browser session JWT (the web dashboard). Returns { user_id, handle } or null.
import { admin, userFromKey, userFromJwt } from "./supabase.mjs";
import { bearer } from "./keys.mjs";

export async function userFromRequest(req) {
  const tok = bearer(req);
  if (!tok) return null;
  if (tok.startsWith("drop_")) return userFromKey(tok);
  const u = await userFromJwt(tok).catch(() => null);
  if (!u) return null;
  const { data: prof } = await admin().from("profiles").select("handle").eq("user_id", u.id).maybeSingle();
  return { user_id: u.id, handle: prof?.handle || null, email: u.email || null };
}
