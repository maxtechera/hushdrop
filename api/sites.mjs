// Hosted-tier site management — list and delete the caller's persistent drops.
//
//   GET  /api/sites            → { sites: [{ slug, url, size, locked, views, created_at }] }
//   DELETE /api/sites?slug=…   → { removed: "<slug>" }  (drops the Blob object + row)
//
// Auth: Bearer API key (same key minted by `hush login`). The CLI uses this for
// `hush list` / `hush rm` when logged in; the /account page uses it too.

import { del } from "@vercel/blob";
import { admin, userFromKey } from "./_lib/supabase.mjs";
import { bearer } from "./_lib/keys.mjs";

export default async function handler(req, res) {
  const user = await userFromKey(bearer(req));
  if (!user) return res.status(401).json({ error: "not authenticated" });
  const db = admin();
  const host = req.headers["x-forwarded-host"] || req.headers.host || "hushdrop.maxtechera.dev";

  if (req.method === "GET") {
    const { data, error } = await db
      .from("sites")
      .select("slug, blob_key, content_type, size_bytes, locked, views, created_at")
      .eq("user_id", user.user_id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: "could not list sites" });
    return res.status(200).json({
      handle: user.handle,
      sites: (data || []).map((s) => ({
        slug: s.slug,
        url: `https://${host}/${user.handle}/${s.slug}`,
        size: s.size_bytes,
        content_type: s.content_type,
        locked: s.locked,
        views: s.views,
        created_at: s.created_at,
      })),
    });
  }

  if (req.method === "PATCH") {
    const slug = String((req.query?.slug) || new URL(req.url, `https://${host}`).searchParams.get("slug") || "").trim();
    if (!slug) return res.status(400).json({ error: "slug required" });
    let body = {};
    try { body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}"); } catch {}
    const patch = {};
    if ("expires_at" in body) patch.expires_at = body.expires_at || null;
    if ("email_gate" in body) patch.email_gate = body.email_gate ? String(body.email_gate).toLowerCase() : null;
    if ("feedback" in body) patch.feedback = !!body.feedback;
    if (!Object.keys(patch).length) return res.status(400).json({ error: "nothing to update (expires_at/email_gate/feedback)" });
    const { data, error } = await db
      .from("sites").update(patch).eq("user_id", user.user_id).eq("slug", slug)
      .select("slug").maybeSingle();
    if (error) return res.status(500).json({ error: "update failed" });
    if (!data) return res.status(404).json({ error: "not found" });
    return res.status(200).json({ slug, ...patch });
  }

  if (req.method === "DELETE") {
    const slug = String((req.query?.slug) || new URL(req.url, `https://${host}`).searchParams.get("slug") || "").trim();
    if (!slug) return res.status(400).json({ error: "slug required" });
    const { data: row } = await db
      .from("sites")
      .select("blob_key")
      .eq("user_id", user.user_id)
      .eq("slug", slug)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: "not found" });
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    try { await del(row.blob_key, { token }); } catch {}
    await db.from("sites").delete().eq("user_id", user.user_id).eq("slug", slug);
    return res.status(200).json({ removed: slug });
  }

  return res.status(405).json({ error: "GET, PATCH or DELETE only" });
}
