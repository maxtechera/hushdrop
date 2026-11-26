<div align="center">

# Hushdrop

**Share what your AI builds.**

Ask your agent for a report, dashboard or prototype and say "share this". It publishes the page behind a
password and gives you the link. Whoever gets it needs a browser and the password, and no account.

[![maxtechera/hushdrop MCP server](https://glama.ai/mcp/servers/maxtechera/hushdrop/badges/score.svg)](https://glama.ai/mcp/servers/maxtechera/hushdrop)
[![CI](https://github.com/maxtechera/hushdrop/actions/workflows/ci.yml/badge.svg)](https://github.com/maxtechera/hushdrop/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[**Add to Claude**](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Hushdrop&connectorUrl=https%3A%2F%2Fhushdrop.dev%2Fmcp) · [**Add to ChatGPT**](https://hushdrop.dev/claude-ai-connector#add-the-connector) · [Website](https://hushdrop.dev) · [Docs](https://hushdrop.dev/docs)

![Hushdrop: share what your AI builds](https://hushdrop.dev/_brand/og.png)

</div>

---

## Connect your agent

| Agent | How |
|---|---|
| **Claude** | [Add to Claude](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Hushdrop&connectorUrl=https%3A%2F%2Fhushdrop.dev%2Fmcp) opens with everything filled in. Click Add, then sign in. |
| **ChatGPT** | [Three short steps](https://hushdrop.dev/claude-ai-connector#add-the-connector), with the address ready to copy. |
| **Anything else** | Paste this to your agent: *Read https://hushdrop.dev/agent.txt and share this page as a private link.* |

The server is `https://hushdrop.dev/mcp` (Streamable HTTP, OAuth). Sign-in is free.

Once it's connected, the agent can publish pages with a password, update them at the same address, list and
restore earlier versions, tell you whether a page was opened, and share into team spaces.

Prefer to run it yourself? See [Self-host](#self-host) and the [CLI reference](#cli-reference).

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
| Zero-knowledge AES-256 | ✅ | ✅ | files only | ❌ |
| Open-source / self-host | ✅ MIT | ❌ | ❌ | ❌ |
| CLI + MCP (agent-native) | ✅ | partial | ❌ | ❌ |
| Anonymous, no-account drop | ✅ | ❌ | ✅ | ✅ |
| Burn-after-read / email-gate | ✅ | partial | partial | ❌ |
| Price | **free / self-host** | paid | freemium | freemium |

Full write-ups: [vs Stacktree](https://hushdrop.dev/stacktree-alternative) · [vs Send](https://hushdrop.dev/send-co-alternative) · [vs ShareDuo](https://hushdrop.dev/shareduo-alternative)

## Features

- 🔒 **Zero-knowledge** — branding + AES-256 happen client-side; the server only stores ciphertext.
- 🌐 **Your domain, your brand** — colors, logo, social cards flow into the unlock gate + previews.
- 🤖 **Agent-native** — a remote MCP server for Claude, ChatGPT and other MCP clients.
- 📧 **Email-gate & revocable share links** — restrict by domain, mint/revoke guest links.
- 📦 **Whole static sites** — drop a folder or zip (`hush ./dist`, `hush site.zip`) → a multi-file site at `/<slug>/`, optionally behind one password. Plus single HTML, Markdown, PDFs, images.
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
| `hush ./dist -p secret` | Whole folder as a site, locked behind one password (self-host) |
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

**Remote MCP (recommended).** Connect `https://hushdrop.dev/mcp` in any client that supports remote MCP servers. Nothing to install; the first call opens a free sign-in (OAuth), then the agent can publish (password-protected by default), restore versions, add editors, share into teams, upload files and read view stats.

```bash
claude mcp add --transport http hushdrop https://hushdrop.dev/mcp   # Claude Code
codex mcp add hushdrop --url https://hushdrop.dev/mcp && codex mcp login hushdrop
```
```jsonc
// Cursor, Windsurf, VS Code; claude.ai / ChatGPT: Settings → Connectors → add the URL
{ "mcpServers": { "hushdrop": { "url": "https://hushdrop.dev/mcp" } } }
```

The remote server locks pages on Hushdrop's side before storing them. For zero-knowledge (encrypted on your machine) or your own domain, use the local server below.

**Local MCP server.** `npx hushdrop-install` registers the **`drops` MCP server** into your detected agents (Claude Code, Codex,
Cursor, Windsurf, OpenCode, Amp), puts `hush` on your `PATH`, and prints config for GUI clients.

```bash
claude mcp add hushdrop -- npx -y hushdrop-mcp        # Claude Code
codex  mcp add hushdrop -- npx -y hushdrop-mcp         # Codex
```
```jsonc
{ "mcpServers": { "hushdrop": { "command": "npx", "args": ["-y", "hushdrop-mcp"] } } }
```

### Local MCP tools

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
**How is this different from Stacktree?** Same agent-native idea, but open-source, self-hostable, your own domain free, and anonymous (no account). See [the comparison](https://hushdrop.dev/stacktree-alternative).
**Can agents use it without MCP?** Yes — it's a single CLI; any agent that runs a shell command can publish.
**Is it free?** Yes. MIT. Self-host costs only your own (usually pennies) Vercel Blob usage.

## Security

- **Locked HTML** is genuinely AES-256 encrypted in the browser — use long passwords; strong against casual access, not a vault.
- **Raw files** are protected by an unguessable slug; use `--page -p <password>` for a gated download.
- Passwords are stored in `~/.hushdrop/manifest.json` on your machine only — never uploaded.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Usage analytics

When the CLI talks to the hosted service (hushdrop.dev), it sends anonymous usage context with each API call: client version, OS, the AI agent it runs under (for example Claude Code or Cursor), and a random per-machine install id stored in `~/.hushdrop/install-id`. Drop contents and passwords are never sent. Set `HUSH_NO_TELEMETRY=1` or `DO_NOT_TRACK=1` to drop the install id. Views of drops on hushdrop.dev are counted without storing viewer IPs.

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). It's a few hundred lines of readable Node + HTML, no build step.

<div align="center">

MIT · Built by [**Max Techera**](https://maxtechera.dev) · [GitHub](https://github.com/maxtechera) · [Instagram](https://instagram.com/maxtechera) · [hushdrop.dev](https://hushdrop.dev)

</div>
