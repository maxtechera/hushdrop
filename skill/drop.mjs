#!/usr/bin/env node
/**
 * hush — instant, branded, password-protected sharing on your own domain.
 *
 * Open-source artifact sharing: drop a file (HTML, PDF, zip, anything) and get a
 * clean, optionally password-locked URL on YOUR domain in ~1s. Bring your own
 * Vercel Blob store + domain via `hush init`; the defaults point at the public
 * hushdrop.dev example deployment.
 *
 * Pipeline (HTML): inject <head> branding/OG + corner badge → (optional) StatiCrypt
 *                  with branded gate → upload to Vercel Blob → clean URL + password.
 * Pipeline (file): upload raw (unguessable slug), or wrap in a branded download page.
 *
 * Serving is a dumb Vercel rewrite/edge-proxy (<domain>/<slug> → blob). No deploy per file.
 */

import { readFile, writeFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { spawn, spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DROP_HOME = join(homedir(), ".hushdrop");
const MANIFEST = join(DROP_HOME, "manifest.json");
const CONFIG_FILE = join(DROP_HOME, "config.json");

// Default deployment = the public hushdrop.dev example. These are NOT secrets
// (the blob host + project id are already public in vercel.json / the Vercel dashboard).
// Run `hush init` to point hush at your OWN domain + Vercel Blob store instead.
const DEFAULTS = {
  domain: "hushdrop.dev",
  blobHost: "opzwhnf3xlqxnotd.public.blob.vercel-storage.com",
  projectId: "prj_c7Yb2JKRvlBduAXyjiWfWEb9ZT9L",
  orgId: "team_3dkH4OzC7klByvov3hsB7J40",
};

// Merge: built-in defaults ← brand/brand.json (presentation) ← ~/.hushdrop/config.json (infra) ← env.
function loadConfig() {
  let cfg = { ...DEFAULTS, brand: {} };
  try {
    const b = JSON.parse(readFileSync(join(__dirname, "brand", "brand.json"), "utf8"));
    cfg.brand = b;
    if (b.domain) cfg.domain = b.domain;
  } catch {}
  try {
    const c = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
    cfg = { ...cfg, ...c, brand: { ...cfg.brand, ...(c.brand || {}) } };
  } catch {}
  if (process.env.DROP_DOMAIN) cfg.domain = process.env.DROP_DOMAIN;
  if (process.env.DROP_BLOB_HOST) cfg.blobHost = process.env.DROP_BLOB_HOST;
  cfg.brandDir = cfg.brandDir || join(__dirname, "brand");
  cfg.links = cfg.brand?.links || {};
  cfg.origin = `https://${cfg.domain}`;
  return cfg;
}
const CONFIG = loadConfig();
const DOMAIN = CONFIG.domain;
const ORIGIN = CONFIG.origin;
const BRAND = CONFIG.brandDir;

// ---------- helpers ----------
const die = (msg) => { console.error(`\x1b[31m✗\x1b[0m ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);

function humanSize(n) {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

function mimeFor(ext) {
  const m = {
    ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
    ".pdf": "application/pdf", ".zip": "application/zip", ".png": "image/png",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".webp": "image/webp", ".txt": "text/plain; charset=utf-8", ".csv": "text/csv",
    ".json": "application/json", ".mp4": "video/mp4", ".mov": "video/quicktime",
    ".md": "text/markdown; charset=utf-8", ".gz": "application/gzip", ".tar": "application/x-tar",
    ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8", ".map": "application/json",
    ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
    ".wasm": "application/wasm", ".xml": "application/xml", ".webmanifest": "application/manifest+json",
  };
  return m[ext.toLowerCase()] || "application/octet-stream";
}

function slugify(name) {
  return basename(name, extname(name))
    .toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "")
    .trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";
}

const rand = (n) => {
  const a = "23456789abcdefghjkmnpqrstuvwxyz";
  let s = "";
  const buf = new Uint8Array(n);
  (globalThis.crypto || require("node:crypto").webcrypto).getRandomValues(buf);
  for (let i = 0; i < n; i++) s += a[buf[i] % a.length];
  return s;
};

const ADJ = ["amber","brisk","clever","copper","dusky","ember","fleet","golden","hazel","ivory","jolly","keen","lunar","mellow","noble","opal","prime","quartz","rapid","silver","tidal","umber","vivid","witty","zesty","bold","crisp","swift","sunny","quiet"];
const NOUN = ["canyon","river","harbor","meadow","summit","orbit","cedar","falcon","lantern","compass","beacon","pebble","willow","cobalt","cypress","drift","ember","glacier","horizon","ridge","comet","delta","fjord","grove","atlas"];
function genPassword() {
  const buf = new Uint8Array(3);
  (globalThis.crypto || require("node:crypto").webcrypto).getRandomValues(buf);
  return `${ADJ[buf[0] % ADJ.length]}-${NOUN[buf[1] % NOUN.length]}-${10 + (buf[2] % 90)}`;
}

function luhn(s) {
  let sum = 0, alt = false;
  for (let i = s.length - 1; i >= 0; i--) { let n = +s[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
  return s.length >= 13 && sum % 10 === 0;
}
// Client-side secret/PII scan run BEFORE encryption+upload. High-signal patterns only
// (the real risk for AI artifacts is an embedded credential); emails warn only in bulk.
function scanPII(text) {
  const hits = [];
  const add = (label, re) => { if (re.test(text)) hits.push(label); };
  add("AWS access key", /\bAKIA[0-9A-Z]{16}\b/);
  add("private key block", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/);
  add("API token/secret", /\b(?:sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|vercel_blob_rw_[A-Za-z0-9_]{20,})\b/);
  add("JWT", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/);
  const cc = (text.match(/\b(?:\d[ -]?){13,16}\b/g) || []).map((c) => c.replace(/[ -]/g, ""));
  if (cc.some(luhn)) hits.push("possible card number");
  const emails = [...new Set(text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) || [])];
  if (emails.length >= 5) hits.push(`${emails.length} email addresses`);
  return [...new Set(hits)];
}

async function dataUri(path) {
  const ext = extname(path).toLowerCase();
  const mime = ext === ".svg" ? "image/svg+xml" : ext === ".png" ? "image/png"
    : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".ico" ? "image/x-icon" : "application/octet-stream";
  const b = await readFile(path);
  return `data:${mime};base64,${b.toString("base64")}`;
}

function clip(text) {
  // pbcopy (mac) · clip.exe/clip (windows + WSL) · xclip/wl-copy (linux)
  for (const cmd of [["pbcopy"], ["clip.exe"], ["clip"], ["xclip", ["-selection", "clipboard"]], ["wl-copy"]]) {
    try {
      const r = spawnSync(cmd[0], cmd[1] || [], { input: text, stdio: ["pipe", "ignore", "ignore"], shell: process.platform === "win32" });
      if (r.status === 0 || (r.status === null && !r.error)) return true;
    } catch {}
  }
  return false;
}

// Load @vercel/blob, auto-installing deps on a fresh machine (node_modules is gitignored).
let _blob = null;
async function loadBlob() {
  if (_blob) return _blob;
  try {
    _blob = await import("@vercel/blob");
  } catch (e) {
    if (e?.code !== "ERR_MODULE_NOT_FOUND") throw e;
    console.error("\x1b[2m… first run on this machine: installing dependencies (npm install)\x1b[0m");
    const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel", "error"], {
      cwd: __dirname, stdio: "inherit", shell: process.platform === "win32",
    });
    if (r.status !== 0) die("npm install failed in the skill dir. Run it manually: cd " + __dirname + " && npm install");
    _blob = await import("@vercel/blob");
  }
  return _blob;
}

async function loadManifest() {
  try { return JSON.parse(await readFile(MANIFEST, "utf8")); } catch { return []; }
}
async function saveManifest(m) {
  await mkdir(DROP_HOME, { recursive: true });
  await writeFile(MANIFEST, JSON.stringify(m, null, 2));
}

function getToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  // fallback: ~/.hushdrop/.env with BLOB_READ_WRITE_TOKEN=...
  const envFile = join(DROP_HOME, ".env");
  if (existsSync(envFile)) {
    const txt = spawnSync("cat", [envFile]).stdout?.toString() || "";
    const match = txt.match(/^\s*BLOB_READ_WRITE_TOKEN\s*=\s*["']?([^"'\n]+)/m);
    if (match) return match[1].trim();
  }
  return null;
}

// ---------- HTML branding ----------
async function buildMeta({ title, url, ogImage }) {
  let meta = await readFile(join(BRAND, "meta.html"), "utf8");
  return meta
    .replace(/__DROP_DOMAIN__/g, DOMAIN)
    .replace(/__DROP_TITLE__/g, escapeAttr(title))
    .replace(/__DROP_URL__/g, url)
    .replace(/__DROP_OG_IMAGE__/g, ogImage)
    // favicon: served from the blob _brand path (gate pages override with a data URI)
    .replace(/__DROP_FAVICON__/g, `${ORIGIN}/_brand/favicon.png`);
}
const escapeAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// Parse "7d" / "24h" / "30m" / "2w" / an ISO date into an absolute ms timestamp.
function parseExpiry(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d+)\s*(m|h|d|w)$/i);
  if (m) {
    const mult = { m: 60e3, h: 36e5, d: 864e5, w: 6048e5 }[m[2].toLowerCase()];
    return Date.now() + Number(m[1]) * mult;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

// Client-side soft-expiry guard baked into the content (survives StatiCrypt decrypt).
// Real deletion is `hush gc` (manifest-driven); this hides the page after the deadline.
function expiryGuard(ts) {
  return `<script>(function(){if(Date.now()>${ts}){document.body.innerHTML='<div style="font-family:system-ui,-apple-system,sans-serif;color:#f5f5f5;background:#0b0b0d;position:fixed;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px"><div><h1 style="font-weight:600;margin:0 0 8px">This link has expired.</h1><p style="opacity:.55;margin:0">Ask the sender for a new one.</p></div></div>';}})();</script>`;
}

// Render Markdown → a clean, branded HTML document (marked auto-installed on demand).
async function mdToHtml(md, title) {
  let marked;
  try { ({ marked } = await import("marked")); }
  catch {
    spawnSync("npm", ["install", "marked", "--no-audit", "--no-fund", "--loglevel", "error"], { cwd: __dirname, stdio: "inherit", shell: process.platform === "win32" });
    ({ marked } = await import("marked"));
  }
  const body = marked.parse(md);
  const accent = CONFIG.brand?.accentColor || "#ea580c";
  const primary = CONFIG.brand?.primaryColor || "#ff6b35";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeAttr(title)}</title>
<style>body{max-width:740px;margin:48px auto;padding:0 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.65;color:#1a1a1a}h1,h2,h3{letter-spacing:-.01em;line-height:1.2}pre{background:#f6f6f7;padding:14px 16px;border-radius:10px;overflow-x:auto}code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em}pre code{background:none}:not(pre)>code{background:#f0f0f1;padding:2px 6px;border-radius:5px}img{max-width:100%}a{color:${accent}}blockquote{border-left:3px solid ${primary};margin:0;padding:2px 0 2px 16px;color:#555}table{border-collapse:collapse}th,td{border:1px solid #e5e5e5;padding:8px 12px}hr{border:none;border-top:1px solid #e5e5e5}</style>
</head><body>${body}</body></html>`;
}

// Substitute owner/brand tokens (social links, colors, owner) shared across templates.
function applyBrandTokens(s) {
  const L = CONFIG.links || {};
  return String(s)
    .replace(/__DROP_GITHUB__/g, L.github || "")
    .replace(/__DROP_INSTAGRAM__/g, L.instagram || "")
    .replace(/__DROP_WEBSITE__/g, L.website || "")
    .replace(/__DROP_OWNER__/g, CONFIG.brand?.owner || "")
    .replace(/__DROP_PRIMARY__/g, CONFIG.brand?.primaryColor || "#ff6b35")
    .replace(/__DROP_ACCENT__/g, CONFIG.brand?.accentColor || "#ea580c");
}

function injectHead(html, snippet) {
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${snippet}\n</head>`);
  if (/<head[^>]*>/i.test(html)) return html.replace(/(<head[^>]*>)/i, `$1\n${snippet}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/(<html[^>]*>)/i, `$1\n<head>\n${snippet}\n</head>`);
  return `<head>\n${snippet}\n</head>\n${html}`;
}
function injectBody(html, snippet) {
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${snippet}\n</body>`);
  return `${html}\n${snippet}`;
}

async function brandHtml(html, { title, url, logoUri, ogImage, expiresAt }) {
  const meta = await buildMeta({ title, url, ogImage });
  let badge = await readFile(join(BRAND, "badge.html"), "utf8");
  badge = applyBrandTokens(badge).replace(/__DROP_LOGO__/g, logoUri).replace(/__DROP_DOMAIN__/g, DOMAIN);
  html = injectHead(html, meta);
  html = injectBody(html, badge);
  if (expiresAt) html = injectBody(html, expiryGuard(expiresAt));
  return html;
}

// ---------- StatiCrypt ----------
async function encrypt(htmlPath, { password, title, logoUri, faviconUri, ogImage, url }) {
  const work = await mkdtemp(join(tmpdir(), "drop-"));
  const outDir = join(work, "out");
  await mkdir(outDir, { recursive: true });

  // build a branded gate template with brand tokens substituted (staticrypt fills its own /*[|..|]*/0)
  let gate = await readFile(join(BRAND, "gate.html"), "utf8");
  const meta = await buildMeta({ title, url, ogImage });
  gate = applyBrandTokens(gate)
    .replace(/__DROP_LOGO__/g, logoUri)
    .replace(/__DROP_FAVICON__/g, faviconUri)
    .replace(/__DROP_DOMAIN__/g, DOMAIN)
    .replace(/__DROP_META__/g, meta);
  const gatePath = join(work, "gate.html");
  await writeFile(gatePath, gate);

  await new Promise((resolve, reject) => {
    const p = spawn("npx", [
      "staticrypt", htmlPath,
      "-p", password,
      "-t", gatePath,
      "-d", outDir,
      "--remember", "false",
      "--short",
      "--template-title", title,
      "--template-instructions", "This page is password-protected. Enter the password to view it.",
      "--template-button", "UNLOCK",
      "--template-placeholder", "Password",
    ], { stdio: ["ignore", "ignore", "inherit"] });
    p.on("error", reject);
    p.on("close", (code) => code === 0 ? resolve() : reject(new Error(`staticrypt exited ${code}`)));
  });

  const files = (await readdir(outDir)).filter((f) => f.endsWith(".html"));
  if (!files.length) throw new Error("staticrypt produced no output");
  const encrypted = await readFile(join(outDir, files[0]), "utf8");
  await rm(work, { recursive: true, force: true });
  return encrypted;
}

// ---------- upload ----------
async function upload(key, body, contentType, token) {
  const { put } = await loadBlob();
  return put(key, body, {
    access: "public", token, addRandomSuffix: false, allowOverwrite: true, contentType,
  });
}

// Managed (zero-setup) publish: POST the already-branded/encrypted bytes to the host's
// managed endpoint. No token, no Vercel setup — the server assigns a `u/` slug.
async function managedPublish(body, contentType, { burn } = {}) {
  const endpoint = `${ORIGIN}/api/publish`;
  const headers = { "content-type": "application/octet-stream", "x-drop-content-type": contentType };
  if (burn) headers["x-drop-burn"] = "1";
  let r;
  try {
    r = await fetch(endpoint, { method: "POST", headers, body });
  } catch (e) { die(`managed publish failed: ${e.message}`); }
  if (!r.ok) { let m; try { m = (await r.json()).error; } catch {} die(`managed publish failed: ${m || r.status}`); }
  return r.json();
}

// Hosted (logged-in free tier) publish: same client-side branded/encrypted bytes, but
// authenticated with the API key so the drop lands persistently at <handle>/<slug>.
async function hostedPublish(body, contentType, slug, locked, emailGate) {
  const key = getApiKey();
  const headers = { "content-type": "application/octet-stream", "x-drop-content-type": contentType, authorization: `Bearer ${key}` };
  if (slug) headers["x-drop-slug"] = slug;
  if (locked) headers["x-drop-locked"] = "1";
  if (emailGate) headers["x-drop-email-gate"] = String(emailGate).replace(/^@/, "").toLowerCase();
  let r;
  try { r = await fetch(`${ORIGIN}/api/publish`, { method: "POST", headers, body }); }
  catch (e) { die(`hosted publish failed: ${e.message}`); }
  if (!r.ok) { let m; try { m = (await r.json()).error; } catch {} die(`hosted publish failed: ${m || r.status}`); }
  return r.json();
}

// Import an npm dep, auto-installing into the skill dir on first use (gitignored).
async function ensureDep(name) {
  try { return await import(name); }
  catch (e) {
    if (e?.code !== "ERR_MODULE_NOT_FOUND") throw e;
    console.error(`\x1b[2m… installing ${name}\x1b[0m`);
    spawnSync("npm", ["install", name, "--no-audit", "--no-fund", "--loglevel", "error"], { cwd: __dirname, stdio: "inherit", shell: process.platform === "win32" });
    return import(name);
  }
}

// ---------- commands ----------
async function cmdDrop(file, opts) {
  if (!file) die("usage: hush <file> [-p password] [-s slug] [--page] [--no-lock]");
  if (!existsSync(file)) die(`no such file: ${file}`);

  const ext = extname(file).toLowerCase();
  const isMd = ext === ".md" || ext === ".markdown";
  const isHtml = ext === ".html" || ext === ".htm" || isMd;

  // Tier selection: when you're logged in, single HTML/Markdown drops go to your hosted
  // account; a Blob token alone (not logged in) = self-host; otherwise it just works,
  // publishing to the zero-setup managed tier. `--managed` forces managed even if you have
  // infra configured. So a bare `hush file.html` needs no flags and no setup.
  const token = opts.managed ? null : getToken();
  const apiKey = getApiKey();
  const hostedEligible = isHtml && !opts.page && ext !== ".zip";
  const mode = opts.managed ? "managed"
    : (apiKey && hostedEligible) ? "hosted"
    : token ? "selfhost"
    : apiKey ? "hosted"
    : "managed"; // zero-setup default — no flag, no account needed
  const logoUri = await dataUri(join(BRAND, "logo-white.png"));
  const faviconUri = await dataUri(join(BRAND, "favicon.png"));
  const ogImage = `${ORIGIN}/_brand/og.png`; // optional; harmless if absent
  const stat = (await readFile(file)).length;
  const expiresAt = parseExpiry(opts.expire);
  if (opts.expire && !expiresAt) die(`bad --expire value: ${opts.expire} (use 7d, 24h, 30m, 2w, or a date)`);

  if ((mode === "managed" || mode === "hosted") && (opts.page || !isHtml)) die(`the ${mode} tier supports HTML/markdown only. Self-host ('hush deploy') for files, --page, and zip sites.`);

  const manifest = await loadManifest();
  const now = new Date().toISOString();

  // multi-file static site from a zip → uploaded under <slug>/, served at <slug>/
  if (ext === ".zip") {
    const { default: AdmZip } = await ensureDep("adm-zip");
    const slug = opts.slug || slugify(file) + "-" + rand(4);
    const entries = new AdmZip(file).getEntries().filter((e) => !e.isDirectory);
    if (!entries.length) die("empty zip");
    const indexEntry = entries
      .filter((e) => /(^|\/)index\.html?$/i.test(e.entryName))
      .sort((a, b) => a.entryName.split("/").length - b.entryName.split("/").length)[0];
    if (!indexEntry) die("no index.html found in the zip");
    // strip a single wrapping top-level folder if present (e.g. dist/)
    const top = indexEntry.entryName.includes("/") ? indexEntry.entryName.slice(0, indexEntry.entryName.indexOf("/") + 1) : "";
    let total = 0, count = 0;
    for (const e of entries) {
      const rel = top && e.entryName.startsWith(top) ? e.entryName.slice(top.length) : e.entryName;
      if (!rel || rel.startsWith("..")) continue;
      let data = e.getData();
      if (/^index\.html?$/i.test(rel)) {
        let html = data.toString("utf8");
        // <base> so relative asset links resolve under /<slug>/ regardless of trailing slash
        if (/<head[^>]*>/i.test(html)) html = html.replace(/<head([^>]*)>/i, `<head$1><base href="/${slug}/">`);
        else html = `<base href="/${slug}/">\n` + html;
        html = await brandHtml(html, { title: opts.title || basename(file, ext), url: `${ORIGIN}/${slug}/`, logoUri, ogImage, expiresAt });
        data = Buffer.from(html, "utf8");
      }
      await upload(`${slug}/${rel}`, data, mimeFor(extname(rel)), token);
      total += data.length; count++;
    }
    const url = `${ORIGIN}/${slug}/`;
    manifest.unshift({ slug, url, type: "site", locked: false, password: null, file: basename(file), size: total, createdAt: now, expiresAt: expiresAt || null });
    await saveManifest(manifest);
    report({ url, password: null, locked: false, extra: `${count} files (multi-file site, public)` });
    return;
  }

  if (isHtml && !opts.page) {
    const slug = opts.slug || slugify(file) + "-" + rand(4);
    const url = `${ORIGIN}/${slug}`;
    const title = opts.title || basename(file, ext).replace(/[-_]+/g, " ");
    let html = await readFile(file, "utf8");
    if (isMd) html = await mdToHtml(html, title);

    // PII / secret scan on the RAW content (before brand + encrypt). Warn by default
    // (agent-friendly); --block-pii refuses; --no-pii-check silences. Skipped for
    // password-locked drops only when explicitly told to (locking already protects them).
    if (!opts.noPiiCheck) {
      const pii = scanPII(html);
      if (pii.length) {
        const msg = `possible sensitive data in ${basename(file)}: ${pii.join(", ")}`;
        if (opts.blockPii) die(`⚠ ${msg}\n  refusing to publish (--block-pii). Remove it, or drop --no-pii-check to publish anyway.`);
        if (!JSON_OUT) console.error(`\x1b[33m⚠ ${msg}\x1b[0m\n  \x1b[2mpublishing anyway — use --block-pii to refuse, --no-pii-check to silence${opts.noLock ? ", and note this drop is PUBLIC (unlocked)" : ""}\x1b[0m`);
      }
    }
    html = await brandHtml(html, { title, url, logoUri, ogImage, expiresAt });

    let password = null, body = html;
    if (!opts.noLock) {
      password = opts.password || genPassword();
      const tmp = await mkdtemp(join(tmpdir(), "drop-in-"));
      const inPath = join(tmp, `${slug}.html`);
      await writeFile(inPath, html);
      body = await encrypt(inPath, { password, title, logoUri, faviconUri, ogImage, url });
      await rm(tmp, { recursive: true, force: true });
    }
    if (mode === "managed") {
      const m = await managedPublish(body, "text/html; charset=utf-8", { burn: opts.burn });
      manifest.unshift({ slug: m.slug, url: m.url, type: "html", locked: !opts.noLock, password, file: basename(file), size: stat, managed: true, burn: !!opts.burn, createdAt: now });
      await saveManifest(manifest);
      report({ url: m.url, password, locked: !opts.noLock, extra: opts.burn ? "managed · burns on first view" : "managed · auto-expires in 24h" });
      return;
    }
    if (mode === "hosted") {
      const m = await hostedPublish(body, "text/html; charset=utf-8", slug, !opts.noLock, opts.emailGate);
      manifest.unshift({ slug: m.slug, url: m.url, type: "html", locked: !opts.noLock, password, file: basename(file), size: stat, hosted: true, handle: m.handle, createdAt: now });
      await saveManifest(manifest);
      report({ url: m.url, password, locked: !opts.noLock, extra: `hosted · ${m.handle}/${m.slug}${opts.emailGate ? ` · @${String(opts.emailGate).replace(/^@/, "")} only` : ""}` });
      return;
    }
    const res = await upload(slug, body, "text/html; charset=utf-8", token);
    manifest.unshift({ slug, url, type: "html", locked: !opts.noLock, password, file: basename(file), size: stat, blobUrl: res.url, createdAt: now, expiresAt: expiresAt || null });
    await saveManifest(manifest);
    report({ url, password, locked: !opts.noLock, extra: expiresAt ? `expires: ${new Date(expiresAt).toISOString().slice(0, 16).replace("T", " ")}` : undefined });
    return;
  }

  if (opts.page) {
    // branded download page wrapping a (any) file
    const slug = opts.slug || slugify(file) + "-" + rand(4);
    const fileKey = `${slug}${ext || ""}`;
    const fileUrl = `${ORIGIN}/${fileKey}`;
    const pageUrl = `${ORIGIN}/${slug}`;
    const title = opts.title || basename(file, ext).replace(/[-_]+/g, " ");

    const fres = await upload(fileKey, await readFile(file), mimeFor(ext), token);

    let page = await readFile(join(BRAND, "download-page.html"), "utf8");
    const meta = await buildMeta({ title, url: pageUrl, ogImage });
    page = applyBrandTokens(page)
      .replace(/__DROP_META__/g, meta)
      .replace(/__DROP_LOGO__/g, logoUri)
      .replace(/__DROP_TITLE__/g, escapeAttr(title))
      .replace(/__DROP_SUBTITLE__/g, "Click below to download.")
      .replace(/__DROP_FILE_NAME__/g, escapeAttr(basename(file)))
      .replace(/__DROP_FILE_SIZE__/g, humanSize(stat))
      .replace(/__DROP_FILE_URL__/g, fileUrl)
      .replace(/__DROP_DOMAIN__/g, DOMAIN);

    let password = null, body = page;
    if (!opts.noLock && opts.password) {
      // only lock the page if a password was explicitly requested (the file URL itself stays unguessable)
      password = opts.password;
      const tmp = await mkdtemp(join(tmpdir(), "drop-in-"));
      const inPath = join(tmp, `${slug}.html`);
      await writeFile(inPath, page);
      body = await encrypt(inPath, { password, title, logoUri, faviconUri, ogImage, url: pageUrl });
      await rm(tmp, { recursive: true, force: true });
    }
    const pres = await upload(slug, body, "text/html; charset=utf-8", token);
    manifest.unshift({ slug, url: pageUrl, type: "page", locked: !!password, password, file: basename(file), size: stat, blobUrl: pres.url, fileBlobUrl: fres.url, createdAt: now, expiresAt: expiresAt || null });
    await saveManifest(manifest);
    report({ url: pageUrl, password, locked: !!password, extra: `file: ${fileUrl}` });
    return;
  }

  // raw file — unguessable slug, no page
  const slug = (opts.slug || slugify(file)) + "-" + rand(6);
  const key = `${slug}${ext || ""}`;
  const url = `${ORIGIN}/${key}`;
  const res = await upload(key, await readFile(file), mimeFor(ext), token);
  manifest.unshift({ slug, url, type: "file", locked: false, password: null, file: basename(file), size: stat, blobUrl: res.url, createdAt: now, expiresAt: expiresAt || null });
  await saveManifest(manifest);
  report({ url, password: null, locked: false, extra: expiresAt ? `expires: ${new Date(expiresAt).toISOString().slice(0, 16).replace("T", " ")}` : undefined });
}

function report({ url, password, locked, extra }) {
  if (JSON_OUT) { console.log(JSON.stringify({ url, password: password || null, locked: !!locked, extra: extra || null })); return; }
  console.log("");
  ok("live");
  console.log(`  \x1b[1m${url}\x1b[0m`);
  if (extra) console.log(`  ${extra}`);
  if (locked && password) console.log(`  password: \x1b[1m\x1b[33m${password}\x1b[0m`);
  const payload = locked && password ? `${url}\npassword: ${password}` : url;
  if (clip(payload)) console.log(`  \x1b[2m(copied to clipboard)\x1b[0m`);
  console.log("");
}

// Logged-in hosted account → list/remove via the API (not the BYO Blob store).
const useHosted = () => getApiKey() && !getToken();

async function hostedList() {
  const key = getApiKey();
  let r; try { r = await fetch(`${ORIGIN}/api/sites`, { headers: { authorization: `Bearer ${key}` } }); } catch (e) { die(e.message); }
  if (!r.ok) die("could not list drops (key invalid? run `hush login`)");
  const { sites } = await r.json();
  const local = await loadManifest();
  const pw = new Map(); for (const d of local) if (d.password) pw.set(d.slug, d.password);
  if (JSON_OUT) { console.log(JSON.stringify(sites.map((s) => ({ ...s, password: pw.get(s.slug) || null })))); return; }
  if (!sites.length) return console.log("no drops yet.");
  for (const s of sites) {
    const known = pw.get(s.slug);
    const lock = known ? `🔒 ${known}` : (s.locked ? "🔒 locked" : "public");
    console.log(`${s.url}\n  ${humanSize(s.size)} · ${lock} · ${String(s.created_at).slice(0, 10)}`);
  }
}

async function hostedRm(slug) {
  const key = getApiKey();
  let r; try { r = await fetch(`${ORIGIN}/api/sites?slug=${encodeURIComponent(slug)}`, { method: "DELETE", headers: { authorization: `Bearer ${key}` } }); } catch (e) { die(e.message); }
  if (!r.ok) { let m; try { m = (await r.json()).error; } catch {} die(m || "remove failed"); }
  const m = await loadManifest(); const kept = m.filter((d) => d.slug !== slug); if (kept.length !== m.length) await saveManifest(kept);
  if (JSON_OUT) { console.log(JSON.stringify({ removed: slug })); return; }
  ok(`removed ${slug}`);
}

async function cmdList() {
  if (useHosted()) return hostedList();
  const token = getToken();
  if (!token) die("BLOB_READ_WRITE_TOKEN not set. Run: hush setup (self-host) or hush login (hosted)");
  const { list } = await loadBlob();
  const { blobs } = await list({ token });
  // overlay local passwords (kept on this machine only) keyed by pathname/slug
  const local = await loadManifest();
  const pw = new Map();
  for (const d of local) { if (d.password) { pw.set(d.slug, d.password); } }
  // sort newest first
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  if (JSON_OUT) {
    console.log(JSON.stringify(blobs.map((b) => {
      const slug = b.pathname.replace(/\.[^.]+$/, "");
      return { slug: b.pathname, url: `${ORIGIN}/${b.pathname}`, size: b.size, password: pw.get(slug) || pw.get(b.pathname) || null, uploadedAt: b.uploadedAt };
    })));
    return;
  }
  if (!blobs.length) return console.log("no drops yet.");
  for (const b of blobs) {
    const slug = b.pathname.replace(/\.[^.]+$/, "");
    const known = pw.get(slug) || pw.get(b.pathname);
    const lock = known ? `🔒 ${known}` : (b.pathname.includes(".") ? "public file" : "page");
    console.log(`${ORIGIN}/${b.pathname}\n  ${humanSize(b.size)} · ${lock} · ${String(b.uploadedAt).slice(0, 10)}`);
  }
}

async function cmdRm(slug) {
  if (!slug) die("usage: hush rm <slug>");
  if (useHosted()) return hostedRm(slug);
  const token = getToken();
  if (!token) die("BLOB_READ_WRITE_TOKEN not set. Run: hush setup (self-host) or hush login (hosted)");
  const { list, del } = await loadBlob();
  const { blobs } = await list({ token });
  // match the page/file key (slug), a sibling like <slug>.<ext>, or a whole site under <slug>/
  const targets = blobs.filter((b) => b.pathname === slug || b.pathname.replace(/\.[^.]+$/, "") === slug || b.pathname.startsWith(slug + "/"));
  if (!targets.length) die(`not found: ${slug}`);
  await del(targets.map((b) => b.url), { token });
  // prune local manifest if present
  const m = await loadManifest();
  const kept = m.filter((d) => d.slug !== slug);
  if (kept.length !== m.length) await saveManifest(kept);
  if (JSON_OUT) { console.log(JSON.stringify({ removed: targets.map((b) => b.pathname) })); return; }
  ok(`removed ${targets.map((b) => b.pathname).join(", ")}`);
}

// Delete drops whose expiry has passed (manifest-driven). Run via cron for true auto-expiry.
async function cmdGc() {
  const m = await loadManifest();
  const nowMs = Date.now();
  const expired = m.filter((d) => d.expiresAt && d.expiresAt < nowMs);
  if (!expired.length) { if (JSON_OUT) console.log("[]"); else ok("nothing expired"); return; }
  const token = getToken();
  if (!token) die("BLOB_READ_WRITE_TOKEN not set. Run: hush setup");
  const { list, del } = await loadBlob();
  const { blobs } = await list({ token });
  const removed = [];
  for (const d of expired) {
    const targets = blobs.filter((b) => b.pathname === d.slug || b.pathname.replace(/\.[^.]+$/, "") === d.slug || b.pathname.startsWith(d.slug + "/"));
    if (targets.length) { await del(targets.map((b) => b.url), { token }); removed.push(...targets.map((b) => b.pathname)); }
  }
  await saveManifest(m.filter((d) => !(d.expiresAt && d.expiresAt < nowMs)));
  if (JSON_OUT) { console.log(JSON.stringify({ removed })); return; }
  ok(removed.length ? `removed ${removed.length} expired: ${removed.join(", ")}` : "manifest pruned (blobs already gone)");
}

// One-command backend: discover the blob host, wire middleware.js + vercel.json,
// write ~/.hushdrop/config.json, and deploy. Assumes a Vercel project + Blob store exist
// (run `vercel link` and `vercel blob store add drops` first, or let setup pull the token).
async function cmdDeploy(opts) {
  const dry = !!opts.dryRun;
  const repoRoot = existsSync(join(__dirname, "..", "middleware.js")) ? join(__dirname, "..") : process.cwd();
  const mwPath = join(repoRoot, "middleware.js");
  const vjPath = join(repoRoot, "vercel.json");
  if (!existsSync(mwPath) || !existsSync(vjPath)) die(`run 'hush deploy' from the hushdrop repo root (middleware.js + vercel.json not found in ${repoRoot})`);

  console.log(`hush deploy — wiring backend in ${repoRoot}${dry ? "  (dry run)" : ""}\n`);

  const hasVercel = spawnSync(process.platform === "win32" ? "where" : "which", ["vercel"], { stdio: "ignore", shell: process.platform === "win32" }).status === 0;

  // 0. auto-provision the Vercel project + Blob store so self-host is one command.
  if (!dry && hasVercel) {
    if (!existsSync(join(repoRoot, ".vercel", "project.json"))) {
      console.log("linking a Vercel project…");
      spawnSync("vercel", ["link", "--yes"], { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
    }
    if (!getToken() && !opts.token) {
      console.log("creating a Blob store 'drops' (if needed)…");
      spawnSync("vercel", ["blob", "store", "add", "drops"], { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
    }
  }

  // 1. token
  let token = getToken() || opts.token;
  if (!token) { token = await pullTokenFromVercel(); }
  if (!token) die("no BLOB_READ_WRITE_TOKEN. Run 'vercel blob store add drops' (or `vercel login`), then: hush deploy --token vercel_blob_rw_...");

  // 2. discover the public blob host via a throwaway upload
  const { put, del } = await loadBlob();
  const probe = await put(".drop-probe", "ok", { access: "public", token, addRandomSuffix: false, allowOverwrite: true, contentType: "text/plain" });
  const blobHost = new URL(probe.url).host;
  await del(probe.url, { token }).catch(() => {});
  ok(`blob host: ${blobHost}`);

  // 3. patch middleware.js fallback host + vercel.json (fallback rewrite) idempotently.
  // (Middleware derives the host from BLOB_READ_WRITE_TOKEN at runtime, so this only
  // pins the fallback for explicit BYO-host setups.)
  let mw = await readFile(mwPath, "utf8");
  const newMw = mw
    .replace(/const DEFAULT_BLOB_HOST = "[^"]+";/, `const DEFAULT_BLOB_HOST = "${blobHost}";`)
    .replace(/const BLOB = "https:\/\/[^"]+";/, `const BLOB = "https://${blobHost}";`);
  let vj = await readFile(vjPath, "utf8");
  const newVj = vj.replace(/https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com/g, `https://${blobHost}`);
  const mwChanged = newMw !== mw, vjChanged = newVj !== vj;
  if (dry) {
    ok(`middleware.js ${mwChanged ? "would update" : "already correct"}`);
    ok(`vercel.json ${vjChanged ? "would update" : "already correct"}`);
  } else {
    if (mwChanged) await writeFile(mwPath, newMw);
    if (vjChanged) await writeFile(vjPath, newVj);
    ok(`middleware.js + vercel.json wired to ${blobHost}`);
  }

  // 4. write config (+ domain) and token
  const cfg = { blobHost };
  if (opts.domain) cfg.domain = opts.domain;
  if (opts.project) cfg.projectId = opts.project;
  if (opts.org) cfg.orgId = opts.org;
  if (!dry) {
    let existing = {};
    try { existing = JSON.parse(readFileSync(CONFIG_FILE, "utf8")); } catch {}
    await mkdir(DROP_HOME, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify({ ...existing, ...cfg }, null, 2) + "\n");
    await writeFile(join(DROP_HOME, ".env"), `BLOB_READ_WRITE_TOKEN=${token}\n`);
    try { spawnSync("chmod", ["600", join(DROP_HOME, ".env")]); } catch {}
    ok(`config + token saved to ${DROP_HOME}`);
  }

  // 5. deploy + domain
  if (dry || opts.noDeploy) {
    console.log(`\n${dry ? "Dry run — would run" : "Skipped deploy. Run"}:  vercel deploy --prod${opts.domain ? `  &&  vercel domains add ${opts.domain}` : ""}`);
    return;
  }
  console.log("\ndeploying to Vercel…");
  const d = spawnSync("vercel", ["deploy", "--prod", "--yes"], { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
  if (d.status !== 0) die("vercel deploy failed — run it manually from the repo root.");
  if (opts.domain) spawnSync("vercel", ["domains", "add", opts.domain], { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
  ok("deployed. Try:  hush <file.html>");
}

// Provision this machine: install deps + ensure the blob token at ~/.hushdrop/.env.
async function cmdSetup(opts) {
  console.log("hush setup — provisioning this machine\n");
  // 1. deps
  await loadBlob();
  ok("dependencies installed");

  // 2. token
  let token = getToken();
  if (!token && opts.token) {
    token = opts.token;
  }
  if (!token) {
    // try to pull from Vercel by the known hushdrop project id (works on any vercel-authed machine on the team)
    token = await pullTokenFromVercel();
  }
  if (!token) {
    die("no BLOB_READ_WRITE_TOKEN found.\n  Provide it directly:   hush setup --token <vercel_blob_rw_...>\n  Or authenticate Vercel: vercel login   (then re-run hush setup)\n  Find it at: Vercel → hushdrop-private project → Storage → drops → .env.local");
  }
  await mkdir(DROP_HOME, { recursive: true });
  await writeFile(MANIFEST.replace(/manifest\.json$/, ".env"), `BLOB_READ_WRITE_TOKEN=${token}\n`);
  // chmod best-effort (no-op on windows)
  try { spawnSync("chmod", ["600", join(DROP_HOME, ".env")]); } catch {}
  ok(`token saved to ${join(DROP_HOME, ".env")}`);

  // 3. verify
  try {
    const { list } = await loadBlob();
    await list({ token });
    ok("verified — blob store reachable");
    console.log("\nReady. Try:  hush <file.html>");
  } catch (e) {
    die("token saved but verification failed: " + (e.message || e));
  }
}

// Point drop at YOUR own deployment (domain + Vercel Blob). Writes ~/.hushdrop/config.json.
async function cmdInit(opts) {
  const cfg = {};
  if (opts.domain) cfg.domain = opts.domain;
  if (opts.blobHost) cfg.blobHost = opts.blobHost;
  if (opts.project) cfg.projectId = opts.project;
  if (opts.org) cfg.orgId = opts.org;
  if (!Object.keys(cfg).length) {
    die(`hush init — run drop on your own domain + Vercel Blob store.

  hush init --domain share.yoursite.com \\
            --blob-host <id>.public.blob.vercel-storage.com \\
            --project prj_xxx --org team_xxx

Writes ~/.hushdrop/config.json (infra). Edit skill/brand/brand.json for your name,
colors and social links. Then:  hush setup --token <vercel_blob_rw_...>
See SETUP.md to stand up the Blob store + domain rewrite first.`);
  }
  let existing = {};
  try { existing = JSON.parse(readFileSync(CONFIG_FILE, "utf8")); } catch {}
  const merged = { ...existing, ...cfg };
  await mkdir(DROP_HOME, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(merged, null, 2) + "\n");
  ok(`config saved to ${CONFIG_FILE}`);
  console.log(`  domain:    ${merged.domain || DEFAULTS.domain}`);
  console.log(`  blob host: ${merged.blobHost || DEFAULTS.blobHost}`);
  console.log(`\nNext:  hush setup --token <vercel_blob_rw_...>   (or: vercel login, then hush setup)`);
}

const KNOWN_PROJECT = { projectId: CONFIG.projectId, orgId: CONFIG.orgId };
async function pullTokenFromVercel() {
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["vercel"], { stdio: ["ignore", "pipe", "ignore"], shell: process.platform === "win32" });
  if (which.status !== 0) return null;
  const tmp = await mkdtemp(join(tmpdir(), "drop-setup-"));
  try {
    await mkdir(join(tmp, ".vercel"), { recursive: true });
    await writeFile(join(tmp, ".vercel", "project.json"), JSON.stringify(KNOWN_PROJECT));
    const r = spawnSync("vercel", ["env", "pull", ".env.pull", "--environment=production", "--yes"], {
      cwd: tmp, stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32",
    });
    if (r.status !== 0) return null;
    const txt = await readFile(join(tmp, ".env.pull"), "utf8");
    const match = txt.match(/^\s*BLOB_READ_WRITE_TOKEN\s*=\s*["']?([^"'\n\r]+)/m);
    return match ? match[1].trim() : null;
  } catch { return null; }
  finally { await rm(tmp, { recursive: true, force: true }); }
}

// ---------- hosted accounts (hush login / whoami / logout) ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getApiKey() {
  if (process.env.DROP_API_KEY) return process.env.DROP_API_KEY;
  try { return JSON.parse(readFileSync(CONFIG_FILE, "utf8")).apiKey || null; } catch { return null; }
}
async function saveApiKey(key) {
  let cfg = {}; try { cfg = JSON.parse(readFileSync(CONFIG_FILE, "utf8")); } catch {}
  cfg.apiKey = key;
  await mkdir(DROP_HOME, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
}
function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  // Detached + non-blocking: spawnSync would HANG the login (and its poll loop) if the
  // opener doesn't return promptly — e.g. on headless machines where xdg-open stalls.
  try { const c = spawn(cmd, [url], { stdio: "ignore", shell: process.platform === "win32", detached: true }); c.unref(); } catch {}
}
async function cmdLogin(opts) {
  if (opts.token && opts.token.startsWith("drop_")) { await saveApiKey(opts.token); ok("API key saved"); return cmdWhoami(); }
  let start;
  try { start = await (await fetch(`${ORIGIN}/api/auth/device/start`, { method: "POST" })).json(); }
  catch (e) { die(`could not reach ${ORIGIN}: ${e.message}`); }
  if (!start?.code) die("login unavailable (hosted tier not configured yet)");
  console.log(`\n  opening ${start.verify_url}`);
  console.log(`  \x1b[2mif it doesn't open, paste that URL into your browser\x1b[0m\n`);
  openBrowser(start.verify_url);
  const deadline = Date.now() + 5 * 60 * 1000;
  process.stdout.write("  waiting for you to approve");
  while (Date.now() < deadline) {
    await sleep((start.poll_interval || 2) * 1000);
    process.stdout.write(".");
    let p; try { p = await (await fetch(`${ORIGIN}/api/auth/device/poll?code=${start.code}`)).json(); } catch { continue; }
    if (p.status === "approved" && p.api_key) { console.log(""); await saveApiKey(p.api_key); ok(`logged in — key saved to ${CONFIG_FILE}`); return cmdWhoami(); }
    if (p.status === "denied") { console.log(""); die("authorization denied"); }
    if (p.status === "expired") { console.log(""); die("code expired — run `hush login` again"); }
  }
  console.log(""); die("login timed out");
}
async function cmdWhoami() {
  const key = getApiKey(); if (!key) die("not logged in. Run: hush login");
  let r; try { r = await fetch(`${ORIGIN}/api/me`, { headers: { authorization: `Bearer ${key}` } }); } catch (e) { die(e.message); }
  if (!r.ok) die("not authenticated (key invalid or revoked). Run: hush login");
  const d = await r.json();
  if (JSON_OUT) { console.log(JSON.stringify(d)); return; }
  ok(`${d.email || "logged in"}${d.handle ? `  ·  handle: ${d.handle}` : ""}`);
}
async function cmdLogout() {
  let cfg = {}; try { cfg = JSON.parse(readFileSync(CONFIG_FILE, "utf8")); } catch {}
  delete cfg.apiKey;
  await mkdir(DROP_HOME, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
  ok("logged out");
}

// ---------- hosted-drop management (Phase 2: set-* / claim / share / migrate) ----------
// Thin authenticated calls against the hosted API. Each needs `hush login` first.
async function apiCall(path, init = {}) {
  const key = getApiKey(); if (!key) die("not logged in — run: hush login");
  let r; try { r = await fetch(`${ORIGIN}${path}`, { ...init, headers: { authorization: `Bearer ${key}`, ...(init.headers || {}) } }); }
  catch (e) { die(`request failed: ${e.message}`); }
  let d = {}; try { d = await r.json(); } catch {}
  if (!r.ok) die(d.error || `request failed (${r.status})`);
  return d;
}
const patchSite = (slug, patch) => apiCall(`/api/sites?slug=${encodeURIComponent(slug)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });

async function cmdSetExpiry(slug, when) {
  if (!slug || !when) die("usage: hush set-expiry <slug> <7d|24h|2w|date|off>");
  const iso = when === "off" ? null : (() => { const at = parseExpiry(when); if (!at) die(`bad expiry: ${when}`); return new Date(at).toISOString(); })();
  await patchSite(slug, { expires_at: iso });
  if (JSON_OUT) return console.log(JSON.stringify({ slug, expires_at: iso }));
  ok(iso ? `expiry set on ${slug} → ${iso.slice(0, 16).replace("T", " ")}` : `expiry cleared on ${slug}`);
}
async function cmdSetEmailGate(slug, domain) {
  if (!slug) die("usage: hush set-email-gate <slug> <domain|off>   (e.g. acme.com)");
  const val = !domain || domain === "off" ? null : domain.replace(/^@/, "").toLowerCase();
  await patchSite(slug, { email_gate: val });
  if (JSON_OUT) return console.log(JSON.stringify({ slug, email_gate: val }));
  ok(val ? `email-gate on ${slug} → only @${val} may open it` : `email-gate cleared on ${slug}`);
}
async function cmdSetFeedback(slug, state) {
  if (!slug) die("usage: hush set-feedback <slug> [on|off]");
  const on = state !== "off";
  await patchSite(slug, { feedback: on });
  if (JSON_OUT) return console.log(JSON.stringify({ slug, feedback: on }));
  ok(`feedback ${on ? "enabled" : "disabled"} on ${slug}`);
}
async function cmdSetPassword(slug, file) {
  // Zero-knowledge: changing the password re-encrypts, which needs the source again.
  if (!slug || !file) die("usage: hush set-password <slug> <file.html> [-p <password>]\n  (zero-knowledge: a password change re-encrypts, so the source file is required)");
  if (!existsSync(file)) die(`no such file: ${file}`);
  return cmdDrop(file, { ...opts, slug, noLock: false, password: opts.password || genPassword() });
}
async function cmdClaim(target) {
  if (!target) die("usage: hush claim <url|slug>   (move an anonymous /u/ drop into your account)");
  if (!getApiKey()) die("not logged in — run: hush login");
  const url = /^https?:/.test(target) ? target : `${ORIGIN}/u/${target.replace(/^u\//, "")}`;
  let body; try { const r = await fetch(url); if (!r.ok) die(`could not fetch ${url} (${r.status})`); body = Buffer.from(await r.arrayBuffer()); }
  catch (e) { die(`could not fetch ${url}: ${e.message}`); }
  const slug = opts.slug || ("claimed-" + rand(4));
  const m = await hostedPublish(body, "text/html; charset=utf-8", slug, false);
  if (JSON_OUT) return console.log(JSON.stringify(m));
  report({ url: m.url, password: null, locked: false, extra: `claimed → ${m.handle}/${m.slug}` });
}
async function cmdShare(slug) {
  if (!slug) die("usage: hush share <slug> [--revoke]");
  const d = await apiCall(`/api/share`, { method: opts.revoke ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) });
  if (JSON_OUT) return console.log(JSON.stringify(d));
  if (opts.revoke) return ok(`share token revoked for ${slug}`);
  ok(`revocable share link → ${d.url}\n  revoke anytime:  hush share ${slug} --revoke`);
}
async function cmdMigrate() {
  // Re-home your hosted drops onto your own Vercel Blob, then rewrite config to self-host.
  const sites = (await apiCall("/api/sites")).sites || [];
  const token = getToken();
  if (opts.dryRun || !token) {
    const tgt = token ? "your Vercel Blob" : "(no blob token yet — run `hush setup` first)";
    if (JSON_OUT) return console.log(JSON.stringify({ dryRun: true, count: sites.length, target: tgt }));
    return console.log(`hush migrate (dry-run): would re-upload ${sites.length} hosted drop(s) to ${tgt}, then rewrite ~/.hushdrop/config.json to self-host on your own domain.`);
  }
  let n = 0;
  for (const s of sites) {
    try { const body = Buffer.from(await (await fetch(s.url)).arrayBuffer()); await upload(`${s.slug}`, body, s.content_type || "text/html; charset=utf-8", token); n++; }
    catch (e) { console.error(`  skip ${s.slug}: ${e.message}`); }
  }
  if (JSON_OUT) return console.log(JSON.stringify({ migrated: n, of: sites.length }));
  ok(`migrated ${n}/${sites.length} drops to your own blob. Run 'hush deploy' to finish self-hosting.`);
}

// ---------- arg parsing ----------
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    password: { type: "string", short: "p" },
    slug: { type: "string", short: "s" },
    title: { type: "string", short: "t" },
    page: { type: "boolean" },
    "no-lock": { type: "boolean" },
    token: { type: "string" },
    domain: { type: "string" },
    "blob-host": { type: "string" },
    project: { type: "string" },
    org: { type: "string" },
    json: { type: "boolean" },
    expire: { type: "string" },
    "dry-run": { type: "boolean" },
    "no-deploy": { type: "boolean" },
    managed: { type: "boolean" },
    burn: { type: "boolean" },
    "email-gate": { type: "string" },
    revoke: { type: "boolean" },
    "no-pii-check": { type: "boolean" },
    "block-pii": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});
const JSON_OUT = !!values.json;

const [cmd, ...rest] = positionals;
const opts = { password: values.password, slug: values.slug, title: values.title, page: values.page, noLock: values["no-lock"], token: values.token, domain: values.domain, blobHost: values["blob-host"], project: values.project, org: values.org, expire: values.expire, dryRun: values["dry-run"], noDeploy: values["no-deploy"], managed: values.managed, burn: values.burn, emailGate: values["email-gate"], revoke: values.revoke, noPiiCheck: values["no-pii-check"], blockPii: values["block-pii"] };

try {
  if (cmd === "init") await cmdInit(opts);
  else if (cmd === "setup") await cmdSetup(opts);
  else if (cmd === "list") await cmdList();
  else if (cmd === "rm") await cmdRm(rest[0]);
  else if (cmd === "gc") await cmdGc();
  else if (cmd === "deploy") await cmdDeploy(opts);
  else if (cmd === "login") await cmdLogin(opts);
  else if (cmd === "logout") await cmdLogout();
  else if (cmd === "whoami") await cmdWhoami();
  else if (cmd === "claim") await cmdClaim(rest[0]);
  else if (cmd === "share") await cmdShare(rest[0]);
  else if (cmd === "migrate") await cmdMigrate();
  else if (cmd === "set-expiry") await cmdSetExpiry(rest[0], rest[1]);
  else if (cmd === "set-email-gate") await cmdSetEmailGate(rest[0], rest[1]);
  else if (cmd === "set-feedback") await cmdSetFeedback(rest[0], rest[1]);
  else if (cmd === "set-password") await cmdSetPassword(rest[0], rest[1]);
  else if (values.help || cmd === "help" || cmd === "--help" || !cmd) {
    console.log(`hush — branded password-protected sharing on ${DOMAIN}

  hush <file.html|.md>          brand + lock (auto password) + upload → clean URL
  hush <file> --managed         zero-setup: publish to the managed tier (no Vercel needed)
  hush <file> -p secret         use your own password
  hush <file> --no-lock         brand only, no password (renders for anyone)
  hush <file> --expire 7d       auto-expire (7d/24h/30m/2w/date); enforce with 'hush gc'
  hush <file> --burn            burn-after-read: the drop self-destructs on first view
  hush <file> --email-gate co.com  only viewers with that email domain may open it
  hush <file> --block-pii       refuse to publish if a secret/credential is detected
  hush <file> --page            branded download page wrapping the file
  hush <file> --page -p secret  password-protect the download page
  hush site.zip                 multi-file static site → /slug/ (public)
  hush <file>                   raw file, unguessable URL
  hush -s myslug <file>         force the slug
  hush list                     list live drops (from the store, cross-machine)
  hush rm <slug>                delete a drop
  hush gc                       delete drops whose --expire has passed (cron-friendly)
  hush init --domain ...        point hush at your own domain + Vercel Blob (BYO)
  hush login                    sign in (magic-link) to host on Hushdrop + persist your drops
  hush whoami                   show your hosted account (email + handle)
  hush logout                   clear your hosted account (forget the API key)
  hush claim <url|slug>         move an anonymous /u/ drop into your account
  hush share <slug> [--revoke]  mint (or revoke) a revocable guest share link
  hush migrate [--dry-run]      re-home your hosted drops to your own blob (self-host)
  hush set-expiry <slug> <when> change a hosted drop's expiry (7d/24h/date/off)
  hush set-email-gate <slug> <domain>  restrict a hosted drop to one email domain
  hush set-password <slug> <file>      re-encrypt a hosted drop with a new password
  hush set-feedback <slug> [on|off]    toggle the feedback widget on a hosted drop
  hush setup [--token <tok>]    provision a machine (deps + blob token)
  hush deploy [--domain ...]    wire backend (blob host → middleware/vercel.json) + deploy`);
  } else {
    // treat cmd as the file
    await cmdDrop(cmd, opts);
  }
} catch (e) {
  die(e.message || String(e));
}
