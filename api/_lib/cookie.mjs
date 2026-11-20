// HMAC-SHA256 signed session cookie for site gates. WebCrypto → runs in edge + node ≥18.
const enc = new TextEncoder();
const b64url = (u8) =>
  btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

export async function signCookie(slug, secret, ttlSec = 604800, nowSec = Math.floor(Date.now() / 1000)) {
  const exp = nowSec + ttlSec;
  return `${exp}.${b64url(await hmac(secret, `${slug}.${exp}`))}`;
}

export async function verifyCookie(value, slug, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (!value || !secret) return false;
  const dot = value.indexOf(".");
  if (dot < 0) return false;
  const exp = Number(value.slice(0, dot));
  const mac = value.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < nowSec) return false;
  const expected = b64url(await hmac(secret, `${slug}.${exp}`));
  if (mac.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
