// API key generation + hashing. We store only the sha-256 hash; the raw key is shown once.
import { randomBytes, createHash } from "node:crypto";

const ALPH = "abcdefghijklmnopqrstuvwxyz0123456789";

export function genKey() {
  const b = randomBytes(24);
  let s = "";
  for (let i = 0; i < 24; i++) s += ALPH[b[i] % ALPH.length];
  const raw = `drop_live_${s}`;
  return { raw, hash: hashKey(raw), prefix: raw.slice(0, 16) };
}

export const hashKey = (raw) => createHash("sha256").update(String(raw)).digest("hex");

// Bearer token from an Authorization header
export function bearer(req) {
  const h = req.headers["authorization"] || req.headers["Authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
