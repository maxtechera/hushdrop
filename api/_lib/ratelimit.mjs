// Per-IP rate limiting for the open anonymous write endpoint — backed by Postgres
// (Supabase), so the whole stack stays single-backend with no external store.
// Enforcement is atomic via the incr_rate_limit RPC (fixed window). Fails OPEN on
// any error so a DB blip never blocks legitimate publishes. (Authenticated/hosted
// writes are quota-bounded in the DB instead.)
import { admin } from "./supabase.mjs";

export function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

// Returns { ok, enforced }. ok=false only when the window is genuinely exceeded.
export async function rateLimit(key, { limit = 20, windowSec = 86400 } = {}) {
  try {
    const { data, error } = await admin().rpc("incr_rate_limit", {
      p_key: key, p_window_sec: windowSec, p_limit: limit,
    });
    if (error) return { ok: true, enforced: false }; // fail-open on limiter error
    return { ok: data === true, enforced: true, limit };
  } catch {
    return { ok: true, enforced: false }; // fail-open on outage
  }
}
