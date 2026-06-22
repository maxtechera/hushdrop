// Who am I — resolves an API key to email + handle (for `hush whoami` / the account page).
import { admin, userFromKey } from "./_lib/supabase.mjs";
import { bearer } from "./_lib/keys.mjs";

export default async function handler(req, res) {
  const u = await userFromKey(bearer(req));
  if (!u) return res.status(401).json({ error: "not authenticated" });
  let email = null;
  try { const { data } = await admin().auth.admin.getUserById(u.user_id); email = data?.user?.email || null; } catch {}
  return res.status(200).json({ user_id: u.user_id, handle: u.handle, email });
}
