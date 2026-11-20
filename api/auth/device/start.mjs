// Device-pairing: CLI starts a login. Returns a code + the browser URL to authorize it.
import { admin } from "../../_lib/supabase.mjs";
import { randomBytes } from "node:crypto";
import { capture, reqProps, installId } from "../../_posthog.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const code = randomBytes(6).toString("hex"); // 12 chars
  const { error } = await admin().from("device_codes").insert({ code, status: "pending" });
  if (error) return res.status(500).json({ error: "could not start login" });
  await capture({ distinctId: installId(req) || `device:${code}`, event: "cli_login_started", properties: { ...reqProps(req) } });
  const host = req.headers["x-forwarded-host"] || req.headers.host || "hushdrop.dev";
  // verify_url uses `dc` (device code), NOT `code` — Supabase's PKCE OAuth return also
  // uses `?code=`; a collision makes the browser exchange the wrong code for a session.
  return res.status(200).json({ code, verify_url: `https://${host}/login?dc=${code}`, poll_interval: 2 });
}
