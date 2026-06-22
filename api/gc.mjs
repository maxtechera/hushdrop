// Cron: delete anonymous managed drops (u/ prefix) older than 24h.
// Wired via vercel.json "crons". Stateless — reads blob uploadedAt, no KV needed.

import { list, del } from "@vercel/blob";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(500).json({ error: "server not configured" });

  const now = Date.now();
  let cursor, removed = 0;
  do {
    const { blobs, cursor: next, hasMore } = await list({ token, prefix: "u/", cursor });
    const stale = blobs.filter((b) => now - new Date(b.uploadedAt).getTime() > MAX_AGE_MS);
    if (stale.length) { await del(stale.map((b) => b.url), { token }); removed += stale.length; }
    cursor = hasMore ? next : undefined;
  } while (cursor);

  return res.status(200).json({ removed });
}
