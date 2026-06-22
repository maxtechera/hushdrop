// Revocable share tokens for a hosted drop. POST mints a guest link (/s/<token>)
// that proxies the drop; DELETE revokes every token for that slug. The canonical
// /<handle>/<slug> URL is unaffected — revoking only kills the guest link.
import { randomBytes } from "node:crypto";
import { admin, userFromKey } from "./_lib/supabase.mjs";
import { bearer } from "./_lib/keys.mjs";

export default async function handler(req, res) {
  const user = await userFromKey(bearer(req));
  if (!user) return res.status(401).json({ error: "not authenticated" });
  const db = admin();
  const host = req.headers["x-forwarded-host"] || req.headers.host || "hushdrop.dev";
  let body = {};
  try { body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}"); } catch {}
  const slug = String(body.slug || "").trim();
  if (!slug) return res.status(400).json({ error: "slug required" });

  // confirm the drop belongs to the caller
  const { data: site } = await db.from("sites").select("slug").eq("user_id", user.user_id).eq("slug", slug).maybeSingle();
  if (!site) return res.status(404).json({ error: "no such drop" });

  if (req.method === "POST") {
    const token = randomBytes(12).toString("hex");
    const { error } = await db.from("share_tokens").insert({ token, user_id: user.user_id, handle: user.handle, slug });
    if (error) return res.status(500).json({ error: "could not mint token" });
    return res.status(200).json({ url: `https://${host}/s/${token}`, token, slug });
  }
  if (req.method === "DELETE") {
    await db.from("share_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", user.user_id).eq("slug", slug).is("revoked_at", null);
    return res.status(200).json({ revoked: slug });
  }
  return res.status(405).json({ error: "POST or DELETE only" });
}
