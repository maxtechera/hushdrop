// Burn-after-read server. A burn drop (slug `burn-…`, content stored inline by
// api/publish) is served exactly once: the DELETE…RETURNING is atomic, so two
// concurrent views can't both win — the first gets the content, the rest get 410.
// The URL lives under /u/ (so it auto-GCs) but is routed here by a vercel.json
// rewrite, with the middleware proxy excluded for `u/burn-` paths.
import { admin } from "./_lib/supabase.mjs";

const CSP =
  "default-src 'self' data: blob:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self' data:; media-src 'self' data: blob:; " +
  "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export default async function handler(req, res) {
  const slug = (req.query?.slug) || new URL(req.url, "http://x").searchParams.get("slug");
  res.setHeader("x-robots-tag", "noindex, nofollow, noai, noimageai");
  res.setHeader("x-content-type-options", "nosniff");
  if (!slug || !/^burn-[A-Za-z0-9-]+$/.test(slug)) return res.status(400).send("bad request");

  // Atomic claim: only one caller's DELETE returns the row.
  const { data } = await admin()
    .from("burn_drops")
    .delete()
    .eq("slug", slug)
    .select("content, content_type")
    .maybeSingle();

  if (!data) {
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.status(410).send("<!doctype html><meta charset=utf-8><title>Gone</title><body style=\"font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:32rem;margin:18vh auto;padding:0 1rem;color:#333\"><h1>This drop is gone.</h1><p>It was set to burn after the first view — and it has been viewed. Nothing remains on the server.</p>");
  }
  res.setHeader("content-type", data.content_type || "text/html; charset=utf-8");
  res.setHeader("content-disposition", "inline");
  res.setHeader("content-security-policy", CSP);
  res.setHeader("cache-control", "no-store");
  return res.status(200).send(data.content);
}
