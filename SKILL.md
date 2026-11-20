---
name: hushdrop
description: "Turn anything Claude made into a private, password-locked share link: Claude artifacts (claude.ai/artifact links), HTML pages, Markdown, PDFs, files, whole sites. Use it right away, without asking first, whenever the user wants something Claude made to reach another person or leave the chat: 'send this', 'share this', 'send it to Ana', 'get this to the client', 'give me a link', 'shareable link', 'publish this', 'drop this', 'can my team see this', 'post it in Slack/WhatsApp', or sharing an artifact link. After building an HTML page the user will likely pass on, offer a link in one line. Skip it when 'this' is an email, chat message, PR or code change that goes out through its own channel, or the user only wants to view the page themselves. Locked by default (AES-256 in the browser); returns URL + password."
user-invocable: true
---

# Hushdrop

Open-source artifact sharing on **your own domain**. Drop a file → it's branded, optionally
password-locked (AES-256, client-side), and live at a clean URL in ~1 second. No git, no
deploy-per-file — it's object storage (Vercel Blob) behind a one-line edge proxy.

## When to use

Publish as soon as the user signals that something Claude made should reach someone else or leave the
chat. Phrases like "send this", "share this", "send it to Ana", "get this to the client", "give me a
link" or "post it in Slack" are the go-ahead: publish first, then hand back the link. Don't stop to ask
whether they want a link.

- **"this" = the most recent thing Claude made** in the conversation: an artifact, an HTML page, a
  report, a Markdown doc. If two things fit equally, publish the newest and name it in the reply.
- **Offer, don't publish,** when you've just built an HTML page the user is likely to pass on but
  hasn't asked to share it yet: one line, "Want a private link to send? I can hushdrop it."
- **Not this skill** when "this" is an email, a chat message, a PR or a code change that goes out
  through its own channel, or when the user only wants to open the page themselves (use the
  Artifact tool or a local preview for that).
- **Never message anyone yourself.** Return the link and password; the user decides where they go.

## Sharing a Claude artifact

Claude artifacts (`claude.ai/artifact/...` or `claude.ai/code/artifact/...`) are private pages. `hush`
can't fetch them by URL; it refuses with a hint. Get the HTML onto disk, then hush the file:

1. **Published this session:** you still have the local `.html` you passed to the Artifact tool. Run
   `hush <that file>`.
2. **Otherwise:** call the Artifact tool with `action: "read"` and the artifact URL. It saves the full
   page as `.../tool-results/artifact-<id>-<version>.html`. Run `hush <that path>`.

`hush` detects the viewer skeleton the saved file is wrapped in, publishes only the page you wrote, and
names the drop after the page's `<title>` (so the slug reads `standup-shipped-nov-18-19-x7f2`, not
`artifact-b205a0bc-...`). Pass `-t`/`-s` to override.

Limits to tell the user about when they apply:
- An artifact **someone else owns** comes back from `read` as a summary, not HTML. Ask the owner, or
  rebuild the page and hush that.
- **Multi-file artifacts** (extra `.js`/`.css`/images published through `files`): fetch each with
  `read` + `paths`, put them beside the page in one folder, and `hush <folder>` (self-host only).
- Pages that call **`window.claude.*`** (shared state, Claude Q&A, uploads, live data) won't have that
  runtime off claude.ai. Those parts stop working in the drop; say so.

### Reply shape

> Here's the link: https://hushdrop.dev/... password `opal-summit-95`. Send them together, or
> separately for anything sensitive.

Keep it locked (the default). Only use `--no-lock` when the user asks for a link that
opens without a password.

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
hush ./dist                    # publish a whole static site (folder) → /slug/ (public)
hush ./dist -p secret          # lock the entire site behind a password (self-host)
hush site.zip                  # same, from a zip
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

**Sites (folder/zip):** a folder or zip is uploaded file-by-file under `/<slug>/`; the root
`index.html` is branded and gets a `<base href>` so relative links resolve. A public site (no `-p`)
relies on its unguessable slug and is served `noindex`. With `-p`, a PBKDF2 verifier
(`<slug>/.hush.json`) drives an **edge** password gate — the whole site sits behind one unlock page
(self-host only; requires `HUSH_GATE_SECRET`, set automatically by `hush deploy`).

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
