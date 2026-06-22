# Contributing to drop

Thanks for helping! drop is a small, readable codebase — plain Node + HTML, no build step.

## Layout
- `skill/drop.mjs` — the CLI (`drop`)
- `skill/mcp.mjs` — the MCP server (`hushdrop-mcp`)
- `skill/install.mjs` — the agent installer (`hushdrop-install`)
- `middleware.js` + `api/` — the Vercel edge proxy + serverless functions
- `site/` — the marketing/SEO surface; **edit `site/pages.data.mjs` / `site/template.mjs`, then run `node skill/gen-site.mjs`** to regenerate the `*.html` (never hand-edit generated pages)
- `tests/` — the PRD acceptance suite (`bash tests/run.sh`)

## Dev setup
```bash
git clone https://github.com/maxtechera/hushdrop && cd hushdrop
cd skill && npm install && cd ..
node skill/drop.mjs --help
```

## Before opening a PR
- `node --check` the JS files you touched.
- If you changed `site/`, run `node skill/gen-site.mjs` and commit the regenerated output.
- Run `bash tests/run.sh` if your change touches the CLI/MCP/API (set `DROP_REPO=$PWD`).
- Open an issue first for large changes.

Keep new code matching the surrounding style (terse, dependency-light).
