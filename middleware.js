// Edge middleware: transparent proxy for drops served from Vercel Blob.
//
// Why this exists: Vercel Blob hard-codes two response headers we can't set at
// upload time and that break in-browser drops:
//   1. `content-disposition: attachment`  -> browsers DOWNLOAD instead of render.
//   2. `content-security-policy: default-src 'none'` -> blocks StatiCrypt's JS,
//      so password-protected drops get stuck on the loading spinner and never decrypt.
// vercel.json `headers` does not reliably override headers on external rewrites,
// so we proxy the blob here and rewrite the headers deterministically.

export const config = {
  // Proxy everything to Blob EXCEPT the static landing page, indexable SEO pages,
  // crawler/analytics files, and Vercel internals (those serve as real static files).
  matcher: ["/((?!_next/|_vercel/|api/|u/burn-|s/|favicon.ico$|sitemap.xml$|robots.txt$|llms.txt$|server.json$|pricing.md$|install.sh$|install$|mcp$|about$|agent-loop-hosting$|agents$|alternatives$|best-private-html-hosting$|best-ways-to-share-ai-artifacts$|blog$|blog/agent-paid-to-provision-itself$|blog/artifacts-in-claude-code-explained$|blog/can-you-make-a-codex-site-public$|blog/dashboard-speaks-webmcp$|blog/loop-engineering-paywall$|blog/mcp-2026-spec-changes$|blog/mcp-resources-vs-tools-vs-prompts$|blog/mcp-servers-explained-for-developers$|blog/per-seat-pricing-ai-agents$|blog/private-by-default-html-hosting$|blog/sites-in-codex-explained$|blog/slack-renders-html-attachments$|blog/what-ai-agents-publish$|blog/what-are-claude-live-artifacts$|blog/what-is-mcp-elicitation$|blog/what-is-vercel-drop$|blog/what-shopify-quick-proves$|blog/why-agents-need-a-publish-primitive$|changelog$|claude-ai-connector$|claude-artifacts-vs-chatgpt-canvas$|claude-code$|claude-desktop$|claude-live-artifacts$|claude-teams-artifact-sharing-alternative$|codex$|compare$|compare/github-pages-vs-vercel$|compare/hushdrop-vs-send-co$|compare/hushdrop-vs-shareduo$|compare/hushdrop-vs-stacktree$|compare/stacktree-vs-shareduo$|compare/storybook-vs-jupyter$|compare/tiiny-host-vs-netlify$|compare/vercel-drop-vs-netlify-drop$|cursor$|deploy-html-from-claude-code$|display-dev-alternative$|docs$|examples$|export-webflow-site$|faq$|gemini-cli$|github-pages-private-alternative$|glossary$|here-now-alternative$|host-ai-reports$|host-storybook-privately$|how-to-host-an-html-file-for-free$|how-to-password-protect-an-html-page$|how-to-share-ai-reports-with-clients$|internal-tool-hosting$|login$|make-claude-artifact-private$|mcp-publish-html$|ngrok-alternative-for-html$|openai-codex-sites-alternative$|opencode$|pricing$|private-html-hosting$|repaint-alternative$|security$|self-host$|self-hosted-vs-hosted-artifact-sharing$|send-co-alternative$|share-architecture-diagrams$|share-claude-artifacts$|share-jupyter-notebook-html$|shareduo-alternative$|shippage-ai-alternative$|skills$|slack$|stacktree-alternative$|static-app-alternative$|tiiny-host-alternative$|try$|use-cases$|vercel-alternative-for-agents$|vibe-coding-hosting$|website-builder-migration$|what-are-claude-artifacts$|what-is-an-mcp-server$|windsurf$|x402$|zed$|$).*)"],
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

export default async function middleware(req) {
  // Read-only public mirror: never proxy writes upstream.
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const { pathname, search } = new URL(req.url);
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
  return new Response(upstream.body, { status: upstream.status, headers });
}
