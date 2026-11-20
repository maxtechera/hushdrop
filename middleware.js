// Edge middleware: transparent proxy for drops served from Vercel Blob.
//
// Why this exists: Vercel Blob hard-codes two response headers we can't set at
// upload time and that break in-browser drops:
//   1. `content-disposition: attachment`  -> browsers DOWNLOAD instead of render.
//   2. `content-security-policy: default-src 'none'` -> blocks StatiCrypt's JS,
//      so password-protected drops get stuck on the loading spinner and never decrypt.
// vercel.json `headers` does not reliably override headers on external rewrites,
// so we proxy the blob here and rewrite the headers deterministically.

import { verifyCookie } from "./api/_lib/cookie.mjs";
import { renderUnlockPage } from "./api/_lib/unlock-page.mjs";

export const config = {
  // Proxy everything to Blob EXCEPT the static landing page, indexable SEO pages,
  // crawler/analytics files, and Vercel internals (those serve as real static files).
  matcher: ["/((?!_next/|_vercel/|api/|u/burn-|s/|favicon.ico$|sitemap.xml$|robots.txt$|llms.txt$|agent.txt$|compare.json$|server.json$|pricing.md$|install.sh$|install$|mcp$|admin$|mt-relay/|about$|agent-loop-hosting$|agents$|alternatives$|best-private-html-hosting$|best-ways-to-share-ai-artifacts$|blog$|blog/agent-paid-to-provision-itself$|blog/artifacts-in-claude-code-explained$|blog/can-you-make-a-codex-site-public$|blog/dashboard-speaks-webmcp$|blog/loop-engineering-paywall$|blog/mcp-2026-spec-changes$|blog/mcp-resources-vs-tools-vs-prompts$|blog/mcp-servers-explained-for-developers$|blog/per-seat-pricing-ai-agents$|blog/private-by-default-html-hosting$|blog/sites-in-codex-explained$|blog/slack-renders-html-attachments$|blog/what-ai-agents-publish$|blog/what-are-claude-live-artifacts$|blog/what-is-mcp-elicitation$|blog/what-is-vercel-drop$|blog/what-shopify-quick-proves$|blog/why-agents-need-a-publish-primitive$|changelog$|claude-ai-connector$|claude-artifacts-vs-chatgpt-canvas$|claude-code$|claude-desktop$|claude-live-artifacts$|claude-teams-artifact-sharing-alternative$|codex$|compare$|compare/github-pages-vs-vercel$|compare/hushdrop-vs-send-co$|compare/hushdrop-vs-shareduo$|compare/hushdrop-vs-stacktree$|compare/stacktree-vs-shareduo$|compare/storybook-vs-jupyter$|compare/tiiny-host-vs-netlify$|compare/vercel-drop-vs-netlify-drop$|cursor$|deploy-html-from-claude-code$|display-dev-alternative$|docs$|examples$|export-webflow-site$|faq$|gemini-cli$|github-pages-private-alternative$|glossary$|here-now-alternative$|host-ai-reports$|host-static-site-privately$|host-storybook-privately$|how-to-host-an-html-file-for-free$|how-to-password-protect-an-html-page$|how-to-share-ai-reports-with-clients$|internal-tool-hosting$|login$|make-claude-artifact-private$|mcp-publish-html$|ngrok-alternative-for-html$|openai-codex-sites-alternative$|opencode$|password-protect-a-website$|pricing$|private-html-hosting$|repaint-alternative$|security$|self-host$|self-hosted-vs-hosted-artifact-sharing$|send-co-alternative$|share-architecture-diagrams$|share-chatgpt-artifacts$|share-claude-artifacts$|share-claude-code-artifacts$|share-codex-artifacts$|share-copilot-artifacts$|share-cursor-artifacts$|share-gemini-artifacts$|share-jupyter-notebook-html$|shareduo-alternative$|shippage-ai-alternative$|skills$|slack$|stacktree-alternative$|static-app-alternative$|tiiny-host-alternative$|try$|use-cases$|vercel-alternative-for-agents$|vibe-coding-hosting$|vs/ooda$|vs/send$|vs/stacktree$|website-builder-migration$|what-are-claude-artifacts$|what-is-an-mcp-server$|windsurf$|x402$|zed$|$).*)"],
};

// Blob host. A self-host instance derives its OWN store from BLOB_READ_WRITE_TOKEN
// (Vercel embeds the store id as `vercel_blob_rw_<storeId>_<secret>`), so a one-click
// Deploy-to-Vercel with an auto-provisioned Blob store serves the right bucket with
// zero patching. Falls back to the canonical store for the reference deployment.
const DEFAULT_BLOB_HOST = "opzwhnf3xlqxnotd.public.blob.vercel-storage.com";
const _storeId = (process.env.BLOB_READ_WRITE_TOKEN || "").split("_")[3];
const BLOB = `https://${_storeId ? `${_storeId.toLowerCase()}.public.blob.vercel-storage.com` : DEFAULT_BLOB_HOST}`;

// Scoped for StatiCrypt + branded drops (data-URI logo/favicon, inline styles).
// No remote origins. StatiCrypt decrypts via WebCrypto (no eval/new Function), so
// 'unsafe-eval' is NOT granted. 'unsafe-inline' for scripts is unavoidable: the
// decrypt routine ships as an inline <script>. Drops live on the isolated
// hushdrop.dev subdomain, so inline-script risk can't reach the main site.
const CSP =
  "default-src 'self' data: blob:; " +
  "script-src 'unsafe-inline'; " +
  "style-src 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "font-src 'self' data:; " +
  "media-src 'self' data: blob:; " +
  "connect-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const BLOB_ORIGIN = new URL(BLOB).origin;

// ---------- drop view analytics ----------
// One `drop_viewed` event per HTML page view of a drop, so the owner's reach and the
// viral loop (viewer -> hushdrop.dev) are measurable. Privacy: no viewer IP is sent
// (country comes from Vercel's header, PostHog geoip is disabled), the viewer id is a
// daily-rotating hash, and no person profile is created. Drop contents are never read.
const PH_KEY = "phc_uoJ9K33L8vUaQe3a4pkwuxs9BC2qaDcsAvsadL9ULcHu"; // public client key (Hushdrop project)
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|linkedin|skype|curl|wget|python|headless/i;

async function trackView(req, pathname) {
  try {
    const ua = req.headers.get("user-agent") || "";
    if (!ua || BOT.test(ua)) return;
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const day = new Date().toISOString().slice(0, 10);
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${ua}|${day}`));
    const viewer = "v_" + [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
    const parts = pathname.split("/").filter(Boolean);
    const anon = parts[0] === "u";
    let refDomain = "";
    try { refDomain = new URL(req.headers.get("referer") || "").hostname; } catch {}
    await fetch("https://us.i.posthog.com/i/v0/e/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: PH_KEY,
        event: "drop_viewed",
        distinct_id: viewer,
        properties: {
          $process_person_profile: false,
          $geoip_disable: true,
          site: "hushdrop.dev",
          source: "edge",
          tier: anon ? "anon" : "hosted",
          owner_handle: anon ? null : parts[0],
          drop: anon ? parts.slice(0, 2).join("/") : parts.slice(0, 2).join("/"),
          path: pathname,
          referring_domain: refDomain || "$direct",
          country_code: req.headers.get("x-vercel-ip-country") || null,
          is_mobile: /mobile|android|iphone/i.test(ua),
        },
      }),
    });
  } catch {}
}

export default async function middleware(req, ctx) {
  // Read-only public mirror: never proxy writes upstream.
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const { pathname, search } = new URL(req.url);

  // Internal verifier is never served to clients.
  if (/(^|\/)\.hush\.json$/.test(pathname)) return new Response("Not found", { status: 404 });

  // Site password gate: a protected <slug>/ requires a valid signed cookie. Returning
  // visitors (valid cookie) skip the verifier fetch entirely.
  const slug = pathname.split("/").filter(Boolean)[0];
  if (slug && /^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    const secret = process.env.HUSH_GATE_SECRET;
    const cookieHeader = req.headers.get("cookie") || "";
    const m = cookieHeader.match(new RegExp(`(?:^|; )hush_${slug}=([^;]+)`));
    const authed = m && secret && (await verifyCookie(decodeURIComponent(m[1]), slug, secret));
    if (!authed) {
      const vr = await fetch(new URL(`/${slug}/.hush.json`, BLOB));
      if (vr.ok) {
        if (!secret) return new Response("gate misconfigured", { status: 503 });
        const verifier = await vr.json().catch(() => ({}));
        return new Response(
          renderUnlockPage({ slug, next: pathname + search, brand: verifier.brand }),
          { status: 401, headers: {
              "content-type": "text/html; charset=utf-8",
              "content-security-policy": CSP,
              "x-robots-tag": "noindex, nofollow",
          } });
      }
    }
  }

  const accept = req.headers.get("accept") || "*/*";
  // Resolve against the blob origin; URL normalization makes host-escape impossible,
  // and we assert it explicitly so this can never become an open proxy.
  let target = new URL(pathname + search, BLOB);
  if (target.origin !== BLOB_ORIGIN) {
    return new Response("Bad request", { status: 400 });
  }
  let upstream = await fetch(target, { method: req.method, headers: { accept } });

  // Multi-file site support (zip drops served under <slug>/): a directory-style
  // path with no file extension falls back to <slug>/index.html. The drop's index
  // carries a <base href="/<slug>/"> so relative asset links resolve either way.
  if (!upstream.ok && !/\.[a-z0-9]+$/i.test(pathname)) {
    const base = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    target = new URL(base + "/index.html" + search, BLOB);
    upstream = await fetch(target, { method: req.method, headers: { accept } });
  }
  if (!upstream.ok) {
    return new Response("Not found", { status: upstream.status });
  }
  const headers = new Headers(upstream.headers);
  headers.set("content-disposition", "inline");
  headers.set("content-security-policy", CSP);
  headers.set("x-content-type-options", "nosniff");
  // Drops must never be indexed — a leaked URL should not show up in Google —
  // and must not be scraped for model training. `noai`/`noimageai` opt out of
  // AI ingestion; only the landing + SEO pages (which bypass this proxy) are crawlable.
  headers.set("x-robots-tag", "noindex, nofollow, noai, noimageai");
  headers.delete("x-frame-options");
  if (req.method === "GET" && /text\/html/i.test(headers.get("content-type") || "") && ctx?.waitUntil) {
    ctx.waitUntil(trackView(req, pathname));
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
