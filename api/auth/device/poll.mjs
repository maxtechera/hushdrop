// Device-pairing: the CLI polls this until the browser approves, then receives the key once.
import { admin } from "../../_lib/supabase.mjs";

export default async function handler(req, res) {
  const code = req.query?.code || new URL(req.url, "http://x").searchParams.get("code");
  if (!code) return res.status(400).json({ error: "code required" });
  const sb = admin();
  const { data } = await sb.from("device_codes").select("status, api_key, expires_at").eq("code", code).maybeSingle();
  if (!data) return res.status(404).json({ status: "not_found" });
  if (new Date(data.expires_at) < new Date()) return res.status(200).json({ status: "expired" });
  if (data.status === "approved" && data.api_key) {
    // one-time delivery: null the raw key after handing it to the CLI
    await sb.from("device_codes").update({ api_key: null }).eq("code", code);
    return res.status(200).json({ status: "approved", api_key: data.api_key });
  }
  return res.status(200).json({ status: data.status });
}
