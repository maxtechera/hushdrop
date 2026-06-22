<div align="center">

# Hushdrop

**Share what your AI builds — on your own domain.**

Open-source, self-hosted artifact sharing. Drop a file, an HTML page, or a whole site and get a
branded, **password-protected (zero-knowledge AES-256)** link on **your own domain** in ~1 second —
from your terminal or any AI agent. The open-source alternative to Stacktree.

[![npm](https://img.shields.io/npm/v/hushdrop?color=ff6b35)](https://www.npmjs.com/package/hushdrop)
[![downloads](https://img.shields.io/npm/dm/hushdrop?color=ff6b35)](https://www.npmjs.com/package/hushdrop)
[![CI](https://github.com/maxtechera/hushdrop/actions/workflows/ci.yml/badge.svg)](https://github.com/maxtechera/hushdrop/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![stars](https://img.shields.io/github/stars/maxtechera/hushdrop?style=social)](https://github.com/maxtechera/hushdrop/stargazers)

[**Live demo →**](https://hushdrop.dev) · [Docs](https://hushdrop.dev/docs) · [Try in browser](https://hushdrop.dev/try) · [vs Stacktree](https://hushdrop.dev/stacktree-alternative)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmaxtechera%2Fhushdrop&stores=%5B%7B%22type%22%3A%22blob%22%7D%5D)

![Hushdrop — share what your AI builds, on your own domain](docs/og.png)

</div>

---

## Quick start

The core way to use Hushdrop is **from your agent** — it publishes what it builds to your own domain.

**Claude Code** (recommended — auto-updates via the plugin marketplace):

```bash
/plugin marketplace add maxtechera/hushdrop
/plugin install hushdrop
```

**Cursor · Codex · Copilot · Gemini · 50+ Agent Skills hosts:**

```bash
npx skills add maxtechera/hushdrop
```

**No install** — open **[hushdrop.dev/try](https://hushdrop.dev/try)**, drop an HTML file, get a link. No account.

**One-off from the terminal** — zero install, zero setup, no account:

```bash
npx hushdrop report.html       # → https://hushdrop.dev/u/xxxx (+ password, copied) — no setup, no account
```

**Free hosted account** — persistent links on your own handle (`hushdrop.dev/you/<slug>`):

```bash
npx hushdrop login                       # passwordless: GitHub or magic link
npx hushdrop report.html                 # → https://hushdrop.dev/you/report-a1b2 (persistent)
```

**Your own domain** — self-host on your Vercel Blob (free, MIT, your URL + brand forever):

```bash
# one-click: the "Deploy with Vercel" button above auto-provisions a Blob store — then:
npx hushdrop-install                         # wire your agents + CLI
hush deploy --domain share.yoursite.com   # or do it from a local clone
```

No dashboard required. Two commands to try; one more to own.

## Why this exists

Anthropic shipped artifact sharing so teams could hand each other the things they make with AI. It's
great — and it's locked to their surface, their domain, their account. Stacktree does the agent-native
version, but it's a closed SaaS: your content sits on their servers, custom domains and limits are
paywalled, and you can't audit or self-host it.

I make things all day with agents: reports, proposals, guides, dashboards, whole little sites. I wanted
to hand someone a link that's **mine** — my domain, my brand, my keys — in the time it takes to type one
command, without uploading client work to someone else's server. So `hush` does exactly that:
terminal-native, zero-knowledge, on your own domain, usable from any agent. MIT.

## Hushdrop vs. the alternatives

| | **Hushdrop** | Stacktree | send.co | tiiny.host |
|---|:---:|:---:|:---:|:---:|
| Your own domain | ✅ free | ❌ | ❌ | paid |
| Zero-knowledge AES-256 | ✅ | ❌ | files only | ❌ |
| Open-source / self-host | ✅ MIT | ❌ | ❌ | ❌ |
| CLI + MCP (agent-native) | ✅ | partial | ❌ | ❌ |
| Anonymous, no-account drop | ✅ | ❌ | ✅ | ✅ |
| Burn-after-read / email-gate | ✅ | ✅ | partial | ❌ |
| Price | **free / self-host** | paid | freemium | freemium |

Full write-ups: [vs Stacktree](https://hushdrop.dev/stacktree-alternative) · [vs Send](https://hushdrop.dev/send-co-alternative) · [vs ShareDuo](https://hushdrop.dev/shareduo-alternative)

## Features

- 🔒 **Zero-knowledge** — branding + AES-256 happen client-side; the server only stores ciphertext.
- 🌐 **Your domain, your brand** — colors, logo, social cards flow into the unlock gate + previews.
- 🤖 **Agent-native** — one CLI command or 9 MCP tools; any agent that runs a shell can publish.
- ⏱️ **Auto-expire & burn-after-read** — `--expire 7d`, `--burn`, server-enforced cleanup.
- 📧 **Email-gate & revocable share links** — restrict by domain, mint/revoke guest links.
- 📦 **Anything static** — HTML, Markdown (rendered), PDFs, images, multi-file zips → sites.
- 🚀 **One-click self-host** — Deploy to Vercel auto-provisions Blob; no DB to run.

## What you can drop

| You run | You get |
|---------|---------|
| `hush report.html` | Branded, AES-256-locked page at `yourdomain.com/<slug>` (+ auto password) |
| `hush notes.md` | Markdown → rendered, branded HTML page |
| `hush report.html -p secret` | Your own password |
| `hush report.html --no-lock` | Branded page, no password — renders for anyone with the link |
| `hush report.html --expire 7d` | Auto-expire (`7d`/`24h`/`2w`/date); enforce with `hush gc` |
| `hush report.html --burn` | Burn-after-read — self-destructs on first view |
| `hush report.html --email-gate acme.com` | Only viewers with that email domain can open it |
| `hush deck.pdf --page` | A branded **download page** wrapping the file |
| `hush site.zip` | Multi-file static site at `yourdomain.com/<slug>/` |
| `hush -s q3 deck.html` | Force the slug |

## CLI reference

| Command | Does |
|---------|------|
| `hush <file>` | Publish (managed / hosted / self-host, auto-detected) |
| `hush login` / `whoami` / `logout` | Passwordless hosted account (GitHub or magic link) |
| `hush list` / `rm <slug>` / `gc` | List, delete, garbage-collect drops |
| `hush share <slug> [--revoke]` | Mint / revoke a revocable guest link |
| `hush claim <url>` | Move an anonymous `/u/` drop into your account |
| `hush set-expiry` / `set-email-gate` / `set-password` / `set-feedback` | Manage a hosted drop |
| `hush init` / `setup` / `deploy` | Configure + self-host on your own domain |
| `hush migrate` | Re-home hosted drops onto your own Blob |

## Use it from any AI agent

`npx hushdrop-install` registers the **`drops` MCP server** into your detected agents (Claude Code, Codex,
Cursor, Windsurf, OpenCode, Amp), puts `hush` on your `PATH`, and prints config for GUI clients.

```bash
claude mcp add hushdrop -- npx -y hushdrop-mcp        # Claude Code
codex  mcp add hushdrop -- npx -y hushdrop-mcp         # Codex
```
```jsonc
{ "mcpServers": { "hushdrop": { "command": "npx", "args": ["-y", "hushdrop-mcp"] } } }
```

### MCP tools (9 — beats Stacktree's 8)

| Tool | Purpose |
|------|---------|
| `publish_html` | Publish raw HTML → branded, password-protected link |
| `publish_file` | Publish a local file (optionally a branded download page) |
| `update_site` | Replace a drop's content in place (same URL) |
| `list_sites` / `delete_site` | List / delete drops |
| `set_password` / `set_expiry` / `set_email_gate` / `set_feedback` | Manage a hosted drop |

## How it works

1. **Read** your file and detect its type.
2. **Brand** (HTML) — inject favicon, OG/Twitter card, and a subtle corner badge before `</body>`.
3. **Encrypt** (if locking) — [StatiCrypt](https://github.com/robinmoisson/staticrypt) (AES-256, client-side) behind your branded unlock gate. The badge is baked in *before* encryption, so it survives.
4. **Upload** to Vercel Blob under a clean key.
5. **Serve** — `yourdomain.com/<slug>` proxies the blob via `middleware.js`, rewriting headers so encrypted HTML decrypts + renders (not downloads) and CSP doesn't block the unlock script. Drops are `noindex, nofollow, noai`.
6. **Report** — URL (+ password) printed and copied to your clipboard.

Serving is a dumb transparent proxy; all branding + encryption happen client-side at upload. The server only ever stores ciphertext.

## Self-host

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmaxtechera%2Fhushdrop&stores=%5B%7B%22type%22%3A%22blob%22%7D%5D)

The Deploy button clones the repo **and auto-provisions a Blob store** (it injects `BLOB_READ_WRITE_TOKEN`;
the app derives its store from the token, so it just works). Then `npx hushdrop-install` + `hush init --domain
share.yoursite.com` to point your CLI + agents at your instance. Self-host is **token-only, free, unlimited
— no account needed.** Full walkthrough in [`skill/SETUP.md`](skill/SETUP.md).

## Configuration

| File | Holds | Committed? |
|------|-------|------------|
| [`skill/brand/brand.json`](skill/brand/brand.json) | **Presentation** — name, colors, owner, social links. Edit to rebrand. | yes |
| `~/.hushdrop/config.json` | **Infra** — domain, blob host, Vercel project. Written by `hush init`. | no |
| `~/.hushdrop/.env` | Your `BLOB_READ_WRITE_TOKEN`. | no |

## FAQ

**Is it really zero-knowledge?** Yes — for locked drops, AES-256 runs in your browser before upload; the server stores only ciphertext.
**Managed vs. hosted vs. self-host?** Managed = anonymous, 24h, no account. Hosted = free account, persistent links on `hushdrop.dev/you/…`. Self-host = your own domain + Blob.
**Does it need Vercel?** Only to self-host. The managed + hosted tiers need nothing but `npx`.
**How is this different from Stacktree?** Same agent-native idea, but open-source, self-hostable, your own domain free, zero-knowledge. See [the comparison](https://hushdrop.dev/stacktree-alternative).
**Can agents use it without MCP?** Yes — it's a single CLI; any agent that runs a shell command can publish.
**Is it free?** Yes. MIT. Self-host costs only your own (usually pennies) Vercel Blob usage.

## Security

- **Locked HTML** is genuinely AES-256 encrypted in the browser — use long passwords; strong against casual access, not a vault.
- **Raw files** are protected by an unguessable slug; use `--page -p <password>` for a gated download.
- Passwords are stored in `~/.hushdrop/manifest.json` on your machine only — never uploaded.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). It's a few hundred lines of readable Node + HTML, no build step.

<div align="center">

MIT · Built by [**Max Techera**](https://maxtechera.dev) · [GitHub](https://github.com/maxtechera) · [Instagram](https://instagram.com/maxtechera) · [hushdrop.dev](https://hushdrop.dev)

</div>
