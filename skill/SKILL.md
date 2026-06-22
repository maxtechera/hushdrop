---
name: hushdrop
description: "Publish/share an artifact (HTML, Markdown, PDF, file, or whole site) as a private, branded, password-protected link on your own domain. Use when the user says 'publish this', 'share this page', 'drop this', 'send them a link', or whenever you've generated an HTML artifact they'll want to open in a browser. Zero-knowledge AES-256, ~1s. Zero-setup via --managed; self-host on your own domain via 'hush init'."
user-invocable: true
---

# Hushdrop

Open-source artifact sharing on **your own domain**. Drop a file → it's branded, optionally
password-locked (AES-256, client-side), and live at a clean URL in ~1 second. No git, no
deploy-per-file — it's object storage (Vercel Blob) behind a one-line edge proxy.

## When to use

Reach for `drop` when the user asks to **publish / share / host / send** something, or whenever
you've generated an HTML page (report, dashboard, mockup, doc) they'll want to view in a browser.
Pipe the artifact to `drop` and hand back the URL (and password, if locked).

## Two ways to run

- **Zero-setup (managed):** `hush file.html --managed` — no token, no Vercel. Publishes to the
  managed tier (HTML/markdown, auto-expires in 24h). Easiest start.
- **Your own domain:** `hush init` once (BYO Vercel Blob + domain, see `SETUP.md`), then `hush file.html`.

## Default posture

Locked by default (AES-256, client-side — the server only stores ciphertext). Every drop is served
`noindex` so leaked URLs never get indexed. Use a long password for anything sensitive.

## Usage

```bash
hush report.html               # brand + lock (auto password) + upload → https://<domain>/report-a1b2
drop notes.md                  # markdown → rendered, branded HTML page
hush report.html -p secret     # use your own password
hush report.html --no-lock     # branded, no password (renders for anyone with the link)
hush report.html --expire 7d   # auto-expire (7d/24h/2w/date); enforce deletion with `hush gc`
drop bundle.zip                # raw file, unguessable URL → /bundle-x7f2k9.zip
drop file.pdf --page           # generate a branded download page wrapping the file
drop file.pdf --page -p secret # password-protect that download page
drop -s q3-deck deck.html      # force the slug → /q3-deck
hush list                      # list live drops + their passwords
hush rm q3-deck                # delete a drop
hush gc                        # delete drops whose --expire has passed (cron-friendly)
```

**MCP server:** `node skill/mcp.mjs` exposes `publish_html`, `publish_file`, `update_site`,
`list_sites`, `delete_site` over stdio. Wire it into agents with `node skill/install.mjs`.

The URL (and password, if locked) is printed and **copied to the clipboard**.

## How it works (per file)

1. **HTML** → inject branded `<head>` (favicon + OG/Twitter card so pasted links show a branded
   preview) + a **subtle corner badge** before `</body>`.
2. If locking: run **StatiCrypt** (AES-256, client-side) with the branded unlock gate. The badge is
   baked into the content *before* encryption, so it survives decryption.
3. Upload to **Vercel Blob** under a clean key; served via `middleware.js` on the configured domain
   (rewrites Blob headers so encrypted HTML renders instead of downloading).

## Configuration

- **Branding** → `brand/brand.json` (name, colors, owner, social links) + swap `brand/logo-white.png`
  and `brand/favicon.png`. Applied automatically to gate, badge, download pages, and link cards.
- **Infra** → `~/.hushdrop/config.json` (domain, blob host, Vercel project/org), written by `hush init`.
- **Token** → `~/.hushdrop/.env` → `BLOB_READ_WRITE_TOKEN`, written by `hush setup`.
- **Env overrides** → `DROP_DOMAIN`, `DROP_BLOB_HOST`.

## Setup (your own deployment)

```bash
hush init --domain share.yoursite.com \
  --blob-host <id>.public.blob.vercel-storage.com --project prj_xxx --org team_xxx
hush setup --token vercel_blob_rw_...   # or: vercel login, then `hush setup`
```

`hush setup` auto-installs `@vercel/blob` and verifies the store. See `SETUP.md` to stand up the
Vercel Blob store + domain rewrite first. The backend is shared — set up once, then `hush list`/`rm`
work from any machine; passwords stay local in `~/.hushdrop/manifest.json`.

## Security notes

- **Locked HTML** is genuinely AES-256 encrypted client-side — strong against casual access. The
  encrypted blob is downloadable, so use long passwords for anything sensitive (it's not a vault).
- **Raw files** are **not** encrypted — protection is the unguessable random slug. For real
  protection on a file, use `--page -p <pw>` (gated page).
- The password manifest at `~/.hushdrop/manifest.json` is plaintext on this machine only.

## Requirements

- `node` ≥ 18, `npx` (StatiCrypt is pulled on demand); `vercel` CLI for `hush setup` token pull
- `@vercel/blob` — auto-installed on first run (gitignored, not committed)
- Clipboard helper (optional): `pbcopy` (mac), `clip`/`clip.exe` (windows/WSL), `xclip`/`wl-copy` (linux)
