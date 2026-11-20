// Shared secret for edge → function calls (middleware recording a view). Reuses
// HUSH_GATE_SECRET so self-hosters don't need another env var.
import { timingSafeEqual } from "node:crypto";

export function internalOk(req) {
  const want = process.env.HUSH_GATE_SECRET || process.env.CRON_SECRET;
  const got = String(req.headers["x-hush-internal"] || "");
  if (!want || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
