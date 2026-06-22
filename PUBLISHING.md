# Publishing to npm

Two packages give the Stacktree-style `npx` UX:

- **`hushdrop-mcp`** (`skill/`) — the CLI + MCP server. Bins: `drop`, `hushdrop-mcp`, `hushdrop-install`.
  Enables `npx -y hushdrop-mcp` and (when installed) the `drop` command.
- **`hushdrop-install`** (`npm/hushdrop-install/`) — thin wrapper so `npx hushdrop-install` works; it
  runs the installer from `hushdrop-mcp` and wires agents to `npx -y hushdrop-mcp`.

## Publish

```bash
npm login                       # required — the session is not currently authenticated

# 1. main package
cd skill && npm publish --access public && cd ..

# 2. installer wrapper (depends on hushdrop-mcp@^0.1.0, so publish it second)
cd npm/hushdrop-install && npm publish --access public && cd ../..
```

Both names are currently available on npm (`hushdrop-mcp`, `hushdrop-install`).

## After publishing, the zero-friction UX is:

```bash
npx hushdrop-install                       # wire the MCP into Claude Code / Codex / Cursor / OpenCode
npx -y hushdrop-mcp                        # run the MCP server (what installers reference)
npx -p hushdrop-mcp hush report.html --managed   # publish, zero setup
```

Bump `version` in both `package.json`s for each release (keep them in lockstep on the major/minor).
