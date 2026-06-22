// Device-pairing: the authenticated browser approves (or denies) the CLI's code,
// mints an API key, and stashes it for the CLI's next poll. Also ensures profile + handle.
import { admin, userFromJwt } from "../../_lib/supabase.mjs";
import { genKey } from "../../_lib/keys.mjs";
import { isReservedHandle } from "../../_lib/reserved.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  let raw = "";
  for await (const c of req) raw += c;
  let body;
  try { body = JSON.parse(raw || "{}"); } catch { return res.status(400).json({ error: "bad json" }); }
  const { code, jwt, approve, handle } = body;

  const user = await userFromJwt(jwt);
  if (!user) return res.status(401).json({ error: "not authenticated" });
  const sb = admin();

  if (approve === false) {
    await sb.from("device_codes").update({ status: "denied", user_id: user.id }).eq("code", code);
    return res.status(200).json({ ok: true, status: "denied" });
  }

  // ensure a profile + handle
  const { data: prof } = await sb.from("profiles").select("handle").eq("user_id", user.id).maybeSingle();
  let userHandle = prof?.handle;
  if (!userHandle) {
    const want = (handle || (user.email || "").split("@")[0] || "user").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
    if (isReservedHandle(want)) return res.status(409).json({ error: "handle reserved or invalid", need_handle: true });
    const { error: he } = await sb.from("profiles").upsert({ user_id: user.id, handle: want });
    if (he) return res.status(409).json({ error: "handle taken", need_handle: true });
    userHandle = want;
  }

  // mint the key
  const { raw: key, hash, prefix } = genKey();
  await sb.from("api_keys").insert({ user_id: user.id, key_hash: hash, prefix, label: "cli" });
  await sb.from("device_codes").update({ status: "approved", api_key: key, user_id: user.id }).eq("code", code);

  return res.status(200).json({ ok: true, status: "approved", handle: userHandle });
}
