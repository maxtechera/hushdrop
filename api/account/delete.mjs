// Account + data deletion (GDPR / right-to-erasure). Authenticated with the
// caller's API key. Removes every Blob object, all DB rows, and the auth user.
import { del } from "@vercel/blob";
import { admin, userFromKey } from "../_lib/supabase.mjs";
import { bearer } from "../_lib/keys.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "POST or DELETE to permanently delete your account + data" });
  }
  const user = await userFromKey(bearer(req));
  if (!user) return res.status(401).json({ error: "not authenticated" });
  const db = admin();
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  // 1. delete every Blob object this user owns
  const { data: sites } = await db.from("sites").select("blob_key").eq("user_id", user.user_id);
  for (const s of sites || []) { try { await del(s.blob_key, { token }); } catch {} }

  // 2. delete all DB rows, then the auth user (cascade-safe order)
  await db.from("sites").delete().eq("user_id", user.user_id);
  await db.from("share_tokens").delete().eq("user_id", user.user_id);
  await db.from("api_keys").delete().eq("user_id", user.user_id);
  await db.from("profiles").delete().eq("user_id", user.user_id);
  try { await db.auth.admin.deleteUser(user.user_id); } catch {}

  return res.status(200).json({ deleted: true, sites_removed: (sites || []).length });
}
