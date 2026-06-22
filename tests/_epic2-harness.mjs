// Epic 2 local verification — drives the real handler functions (api/publish, api/sites,
// api/me) against the live Supabase project + Blob store, then cleans everything up.
// Run: node tests/_epic2-harness.mjs   (env: SUPABASE_URL/ANON/SERVICE_ROLE + blob token)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

// blob token from the local self-host config
const blobEnv = readFileSync(`${process.env.HOME}/.hushdrop/.env`, "utf8");
process.env.BLOB_READ_WRITE_TOKEN = (blobEnv.match(/BLOB_READ_WRITE_TOKEN=([^\n]+)/) || [])[1];

const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(URL_, SVC, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  PASS  ${m}`)) : (fail++, console.log(`  FAIL  ${m}`)); };

// mock req/res
function mkReq({ method = "GET", headers = {}, body = null, query = {}, url = "/" }) {
  const req = { method, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])), query, url };
  req[Symbol.asyncIterator] = async function* () { if (body) yield Buffer.from(body); };
  return req;
}
function mkRes() {
  const res = { _status: 0, _json: null,
    status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; },
    setHeader() { return this; }, end() { return this; } };
  return res;
}

const handle = "htest" + randomBytes(3).toString("hex");
const rawKey = "drop_live_" + randomBytes(12).toString("hex");
const keyHash = createHash("sha256").update(rawKey).digest("hex");
let userId;

try {
  // ---- seed: auth user + profile + api key ----
  const email = `${handle}@example.com`;
  const { data: u, error: ue } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (ue) throw ue; userId = u.user.id;
  await db.from("profiles").insert({ user_id: userId, handle, plan: "free" });
  await db.from("api_keys").insert({ user_id: userId, key_hash: keyHash, prefix: rawKey.slice(0, 16), label: "harness" });
  console.log(`seeded user ${handle} (${userId.slice(0, 8)}…)\n`);

  const auth = { authorization: `Bearer ${rawKey}` };
  const me = (await import("../api/me.mjs")).default;
  const publish = (await import("../api/publish.mjs")).default;
  const sites = (await import("../api/sites.mjs")).default;

  // ---- /api/me ----
  let r = mkRes(); await me(mkReq({ headers: auth }), r);
  ok(r._status === 200 && r._json.handle === handle, `me → 200, handle=${r._json?.handle}`);
  r = mkRes(); await me(mkReq({ headers: {} }), r);
  ok(r._status === 401, "me (no key) → 401");

  // ---- /api/publish (hosted) ----
  const html = "<!doctype html><title>probe</title><h1>hosted probe</h1>";
  r = mkRes();
  await publish(mkReq({ method: "POST", headers: { ...auth, "x-drop-content-type": "text/html", "x-drop-slug": "probe", "x-drop-locked": "1" }, body: html }), r);
  ok(r._status === 200 && r._json.hosted === true && r._json.url.endsWith(`/${handle}/probe`), `publish hosted → ${r._json?.url}`);

  // ---- publish auth-rejection paths ----
  r = mkRes(); await publish(mkReq({ method: "POST", headers: { authorization: "Bearer drop_live_bogus", "x-drop-content-type": "text/html" }, body: html }), r);
  ok(r._status === 401, "publish bad key → 401");

  // ---- /api/sites GET shows the drop ----
  r = mkRes(); await sites(mkReq({ method: "GET", headers: auth }), r);
  const found = (r._json?.sites || []).find((s) => s.slug === "probe");
  ok(r._status === 200 && found && found.locked === true, `sites GET → lists probe (locked=${found?.locked})`);

  // ---- quota math: size_bytes recorded ----
  ok(found && found.size > 0, `sites GET → size recorded (${found?.size}b)`);

  // ---- /api/sites DELETE ----
  r = mkRes(); await sites(mkReq({ method: "DELETE", headers: auth, query: { slug: "probe" }, url: "/api/sites?slug=probe" }), r);
  ok(r._status === 200 && r._json.removed === "probe", "sites DELETE → removed probe");
  r = mkRes(); await sites(mkReq({ method: "GET", headers: auth }), r);
  ok((r._json?.sites || []).length === 0, "sites GET → empty after delete");

} catch (e) {
  fail++; console.log(`  FAIL  harness error: ${e.message}`);
} finally {
  // ---- cleanup ----
  if (userId) {
    await db.from("sites").delete().eq("user_id", userId);
    await db.from("api_keys").delete().eq("user_id", userId);
    await db.from("profiles").delete().eq("user_id", userId);
    await db.auth.admin.deleteUser(userId).catch(() => {});
  }
  // belt-and-suspenders: remove any probe blob
  try { const { del } = await import("@vercel/blob"); await del(`${handle}/probe`, { token: process.env.BLOB_READ_WRITE_TOKEN }); } catch {}
  console.log(`\nTALLY: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
