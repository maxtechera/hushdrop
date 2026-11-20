// Server-side PostHog helper for hushdrop.dev API handlers.
//
// Uses posthog-node with flushAt:1 / flushInterval:0 so every capture is sent
// immediately (important for short-lived Vercel functions that freeze after the
// response is sent). Reads the project key from POSTHOG_KEY (same secret that
// the site-gen script injects as __POSTHOG_KEY__ in HTML). If the key is absent
// the helper is a no-op — analytics never breaks a handler.
//
// PRIVACY: this helper only captures metadata (slugs, user IDs, sizes, flags).
// Drop contents, passwords, and encryption material are NEVER passed here.

import { PostHog } from "posthog-node";

const KEY = process.env.POSTHOG_KEY;
const HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ||
  process.env.POSTHOG_HOST ||
  "https://us.i.posthog.com";

// Singleton client — re-used across warm function invocations.
let _client = null;

function client() {
  if (!KEY) return null;
  if (!_client) {
    _client = new PostHog(KEY, {
      host: HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return _client;
}

/**
 * Capture a server-side event and flush immediately so it transmits before
 * the Vercel function freezes.
 *
 * @param {{ distinctId: string, event: string, properties?: Record<string,unknown> }} opts
 */
export async function capture({ distinctId, event, properties = {} }) {
  const ph = client();
  if (!ph) return; // no-op when POSTHOG_KEY is unset
  try {
    ph.capture({
      distinctId,
      event,
      properties: {
        site: "hushdrop.dev",
        source: "server",
        ...properties,
      },
    });
    await ph.flush();
  } catch (err) {
    console.warn("[posthog] capture failed (non-fatal):", err?.message);
  }
}

/**
 * Request context for server events: the caller's IP (so PostHog geolocates the
 * user, not the Vercel region), user agent, and which client sent it.
 * Client = explicit x-drop-client header (cli/mcp/web), else a UA guess.
 */
export function reqProps(req) {
  const h = req?.headers || {};
  const ip = String(h["x-forwarded-for"] || "").split(",")[0].trim() || h["x-real-ip"] || undefined;
  const ua = String(h["user-agent"] || "");
  const client = h["x-drop-client"]
    ? String(h["x-drop-client"]).slice(0, 40)
    : /^node|undici/i.test(ua) ? "cli" : /mozilla/i.test(ua) ? "web" : ua ? "other" : "unknown";
  const v = (k, n = 64) => (h[k] ? String(h[k]).slice(0, n) : undefined);
  return {
    $ip: ip, user_agent: ua.slice(0, 200) || undefined, client,
    client_version: v("x-drop-client-version", 24), os: v("x-drop-os", 40), agent: v("x-drop-agent", 40),
    node_version: v("x-drop-node", 24), ci: h["x-drop-ci"] ? true : undefined,
  };
}

/** The CLI's random per-machine install id (x-drop-install-id), if it sent one. */
export function installId(req) {
  const v = String(req?.headers?.["x-drop-install-id"] || "");
  return /^[a-f0-9-]{36}$/.test(v) ? v : null;
}

/** Merge an anonymous install id into a user's person, so pre-login CLI use joins the account. */
export async function alias(userId, anonId) {
  const ph = client();
  if (!ph || !userId || !anonId || userId === anonId) return;
  try { ph.alias({ distinctId: userId, alias: anonId }); await ph.flush(); }
  catch (err) { console.warn("[posthog] alias failed (non-fatal):", err?.message); }
}
