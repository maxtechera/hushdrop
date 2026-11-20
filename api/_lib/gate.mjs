// PBKDF2-SHA256 password verification against a .hush.json verifier. WebCrypto (edge+node).
// Params MUST match skill/site.mjs VERIFIER_PARAMS — tests/unit/gate.test.mjs guards drift.
const enc = new TextEncoder();
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (u8) => btoa(String.fromCharCode(...u8));

export async function verifyPassword(verifier, password) {
  if (!verifier || verifier.algo !== "PBKDF2-SHA256") return false;
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromB64(verifier.salt), iterations: verifier.iters, hash: "SHA-256" },
    key, 32 * 8));
  const got = toB64(bits);
  const want = toB64(fromB64(verifier.hash));
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
