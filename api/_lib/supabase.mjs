// Supabase helpers for the hosted tier. Server-only (service role bypasses RLS).
import { createClient } from "@supabase/supabase-js";
import { hashKey } from "./keys.mjs";

export function admin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Verify a browser session JWT (from Supabase magic-link auth) → user or null.
export async function userFromJwt(jwt) {
  if (!jwt) return null;
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
}

// Verify an API key (Bearer) → { user_id, handle } or null. Bumps last_used_at.
// Two queries (no PostgREST embed): api_keys and profiles both FK to auth.users
// separately, so there's no direct api_keys→profiles relationship to embed.
export async function userFromKey(raw) {
  if (!raw) return null;
  const sb = admin();
  const h = hashKey(raw);
  const { data: key } = await sb.from("api_keys").select("user_id, revoked_at").eq("key_hash", h).maybeSingle();
  if (!key || key.revoked_at) return null;
  sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key_hash", h).then(() => {});
  const { data: prof } = await sb.from("profiles").select("handle").eq("user_id", key.user_id).maybeSingle();
  return { user_id: key.user_id, handle: prof?.handle || null };
}
