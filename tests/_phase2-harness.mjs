// Phase 2 local verification — drives the new handlers (burn, sites PATCH, share,
// account/delete) against the live Supabase project, with cleanup.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

const blobEnv = readFileSync(`${process.env.HOME}/.hushdrop/.env`, "utf8");
process.env.BLOB_READ_WRITE_TOKEN = (blobEnv.match(/BLOB_READ_WRITE_TOKEN=([^\n]+)/) || [])[1];
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  PASS  ${m}`)) : (fail++, console.log(`  FAIL  ${m}`)); };
function mkReq({ method = "GET", headers = {}, body = null, query = {}, url = "/" }) {
  return { method, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])), query, url, body };
}
function mkRes() {
  return { _status: 0, _body: null, _hdr: {},
    status(c) { this._status = c; return this; },
    json(o) { this._body = o; return this; },
    send(s) { this._body = s; return this; },
    setHeader(k, v) { this._hdr[k] = v; return this; }, end() { return this; } };
}

const handle = "qtest" + randomBytes(3).toString("hex");
const rawKey = "drop_live_" + randomBytes(12).toString("hex");
let userId;
try {
  const { data: u } = await db.auth.admin.createUser({ email: `${handle}@example.com`, email_confirm: true });
  userId = u.user.id;
  await db.from("profiles").insert({ user_id: userId, handle, plan: "free" });
  await db.from("api_keys").insert({ user_id: userId, key_hash: createHash("sha256").update(rawKey).digest("hex"), prefix: rawKey.slice(0, 16) });
  await db.from("sites").insert({ slug: "rep", handle, user_id: userId, blob_key: `${handle}/rep`, content_type: "text/html; charset=utf-8", size_bytes: 10 });
  const auth = { authorization: `Bearer ${rawKey}` };

  const burn = (await import("../api/burn.mjs")).default;
  const sites = (await import("../api/sites.mjs")).default;
  const share = (await import("../api/share.mjs")).default;
  const del = (await import("../api/account/delete.mjs")).default;

  // burn: insert a row, serve once (200), serve again (410)
  await db.from("burn_drops").insert({ slug: "burn-probe1", content: "<h1>burn</h1>", content_type: "text/html" });
  let r = mkRes(); await burn(mkReq({ query: { slug: "burn-probe1" } }), r);
  ok(r._status === 200 && String(r._body).includes("burn"), `burn first view → 200 + content`);
  r = mkRes(); await burn(mkReq({ query: { slug: "burn-probe1" } }), r);
  ok(r._status === 410, `burn second view → 410 (gone)`);

  // sites PATCH: expiry + email_gate + feedback
  r = mkRes(); await sites(mkReq({ method: "PATCH", headers: auth, query: { slug: "rep" }, body: { email_gate: "ACME.com", feedback: true, expires_at: "2030-01-01T00:00:00Z" } }), r);
  ok(r._status === 200, `sites PATCH → 200`);
  const { data: row } = await db.from("sites").select("email_gate, feedback, expires_at").eq("user_id", userId).eq("slug", "rep").maybeSingle();
  ok(row?.email_gate === "acme.com" && row?.feedback === true && !!row?.expires_at, `PATCH persisted (gate=${row?.email_gate}, fb=${row?.feedback})`);

  // share: mint token, then revoke
  r = mkRes(); await share(mkReq({ method: "POST", headers: auth, body: { slug: "rep" } }), r);
  const token = r._body?.token;
  ok(r._status === 200 && token && r._body.url.includes(`/s/${token}`), `share POST → token ${token?.slice(0, 8)}…`);
  r = mkRes(); await share(mkReq({ method: "DELETE", headers: auth, body: { slug: "rep" } }), r);
  const { data: tok } = await db.from("share_tokens").select("revoked_at").eq("token", token).maybeSingle();
  ok(r._status === 200 && !!tok?.revoked_at, `share DELETE → token revoked`);

  // account/delete: wipes everything
  r = mkRes(); await del(mkReq({ method: "POST", headers: auth }), r);
  ok(r._status === 200 && r._body.deleted === true, `account delete → ${JSON.stringify(r._body)}`);
  const { data: gone } = await db.from("profiles").select("handle").eq("user_id", userId).maybeSingle();
  ok(!gone, `profile gone after delete`);
} catch (e) {
  fail++; console.log(`  FAIL  harness error: ${e.message}`);
} finally {
  if (userId) {
    await db.from("sites").delete().eq("user_id", userId);
    await db.from("share_tokens").delete().eq("user_id", userId);
    await db.from("api_keys").delete().eq("user_id", userId);
    await db.from("profiles").delete().eq("user_id", userId);
    await db.auth.admin.deleteUser(userId).catch(() => {});
  }
  await db.from("burn_drops").delete().eq("slug", "burn-probe1");
  console.log(`\nTALLY: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
