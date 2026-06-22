// Guest-link resolver: /s/<token> → proxy the drop's bytes (never a redirect, so
// revoking the token actually blocks access — the recipient never learns the
// canonical /<handle>/<slug> URL). Routed here by a vercel.json rewrite.
import { admin } from "./_lib/supabase.mjs";

const BLOB = "https://opzwhnf3xlqxnotd.public.blob.vercel-storage.com";
const CSP =
  "default-src 'self' data: blob:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self' data:; media-src 'self' data: blob:; " +
  "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export default async function handler(req, res) {
  const token = (req.query?.t) || new URL(req.url, "http://x").searchParams.get("t");
  res.setHeader("x-robots-tag", "noindex, nofollow, noai, noimageai");
  res.setHeader("x-content-type-options", "nosniff");
  if (!token || !/^[a-f0-9]{8,}$/.test(token)) return res.status(400).send("bad link");

  const db = admin();
  const { data: tok } = await db.from("share_tokens").select("handle, slug, revoked_at").eq("token", token).maybeSingle();
  if (!tok) return res.status(404).send("This share link doesn't exist.");
  if (tok.revoked_at) return res.status(403).send("This share link has been revoked.");

  const { data: site } = await db.from("sites").select("blob_key, content_type").eq("handle", tok.handle).eq("slug", tok.slug).maybeSingle();
  if (!site) return res.status(404).send("The shared drop no longer exists.");

  let upstream;
  try { upstream = await fetch(`${BLOB}/${site.blob_key}`); } catch { return res.status(502).send("upstream error"); }
  if (!upstream.ok) return res.status(upstream.status).send("not found");
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.setHeader("content-type", site.content_type || "text/html; charset=utf-8");
  res.setHeader("content-disposition", "inline");
  res.setHeader("content-security-policy", CSP);
  return res.status(200).send(buf);
}
