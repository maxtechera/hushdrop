# hushdrop-mcp

**Open-source artifact sharing — publish HTML/Markdown/files as branded, password-protected,
zero-knowledge links on your own domain, from any AI agent.** CLI + MCP server. The open-source,
self-hosted [Stacktree](https://stacktr.ee) alternative.

→ Site & docs: **[hushdrop.dev](https://hushdrop.dev)** · Source: [github.com/maxtechera/hushdrop](https://github.com/maxtechera/hushdrop)

## Install

```bash
npx hushdrop-install            # wire the MCP into Claude Code / Codex / Cursor / OpenCode
# or one-line installer:
curl -fsSL https://hushdrop.dev/install.sh | sh
```

## Use

```bash
hush report.html             # just works — anonymous managed link, no setup or account (auto-expires 24h)
hush login                   # free account → persistent links on your own handle
hush deploy --domain you.com # self-host → your own domain (after a Blob token)
drop notes.md                # markdown → branded HTML
drop site.zip                # multi-file static site
hush list | rm <slug> | gc   # manage drops
```

## MCP

```bash
claude mcp add hushdrop -- npx -y hushdrop-mcp
```

Tools: `publish_html`, `publish_file`, `update_site`, `list_sites`, `delete_site`.

## How it works

Branding + AES-256 encryption happen **client-side** (StatiCrypt) before upload to Vercel Blob; an
edge proxy serves it from your domain with the right headers. The server only ever stores ciphertext.

MIT © [Max Techera](https://maxtechera.dev)
