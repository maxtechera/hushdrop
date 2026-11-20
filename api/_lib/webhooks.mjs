// Webhook delivery with SSRF guards. User-supplied URLs are fetched server-side, so:
// https only, no private/loopback/link-local targets (checked after DNS resolution),
// no redirects, 5s timeout, HMAC-SHA256 signature. Auto-disables after 20 straight failures.
import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { admin } from "./supabase.mjs";

export const EVENTS = ["drop.viewed", "drop.first_opened", "lead.captured"];
export const newSecret = () => "whsec_" + randomBytes(24).toString("hex");

export function privateAddr(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateAddr(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

/** Validate a webhook URL shape (sync). Returns an error string or null. */
export function badUrl(raw) {
  let u; try { u = new URL(raw); } catch { return "not a valid URL"; }
  if (u.protocol !== "https:") return "webhook URL must be https";
  if (u.username || u.password) return "no credentials in the URL";
  if (u.port && u.port !== "443") return "only port 443";
  const h = u.hostname.replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || (isIP(h) && privateAddr(h))) return "private addresses are not allowed";
  return null;
}

export function sign(secret, body, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

export async function deliver(hook, type, data) {
  if (badUrl(hook.url)) return { ok: false, status: 0, error: "bad url" };
  try {
    const { hostname } = new URL(hook.url);
    const addrs = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
    if (!addrs.length || addrs.some((a) => privateAddr(a.address))) return { ok: false, status: 0, error: "resolves to a private address" };
  } catch { return { ok: false, status: 0, error: "dns failed" }; }
  const body = JSON.stringify({ id: randomBytes(8).toString("hex"), type, created_at: new Date().toISOString(), data });
  try {
    const r = await fetch(hook.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: { "content-type": "application/json", "user-agent": "Hushdrop-Webhooks/1", "x-hushdrop-event": type, "x-hushdrop-signature": sign(hook.secret, body) },
      body,
    });
    return { ok: r.status >= 200 && r.status < 300, status: r.status };
  } catch (e) { return { ok: false, status: 0, error: e.name === "TimeoutError" ? "timeout" : "network" }; }
}

/** drop-events listener: send to every matching, enabled webhook of the drop's owner. */
export async function webhookListener(type, data) {
  if (!data?.user_id) return;
  const db = admin();
  const { data: hooks, error } = await db.from("webhooks").select("id, url, secret, events, site_id, failures")
    .eq("user_id", data.user_id).is("disabled_at", null);
  if (error || !hooks?.length) return;
  const payload = { handle: data.handle, slug: data.slug, url: `https://hushdrop.dev/${data.handle}/${data.slug}`, views: data.views, country: data.country || null, referrer: data.referrer || null, ...(data.email ? { email: data.email } : {}), ...(data.fields ? { fields: data.fields } : {}) };
  await Promise.allSettled(hooks.filter((h) => (!h.site_id || h.site_id === data.site_id) && h.events.includes(type)).map(async (h) => {
    const r = await deliver(h, type, payload);
    const failures = r.ok ? 0 : (h.failures || 0) + 1;
    await db.from("webhooks").update({ last_delivery_at: new Date().toISOString(), last_status: r.status, failures, ...(failures >= 20 ? { disabled_at: new Date().toISOString() } : {}) }).eq("id", h.id);
  }));
}
