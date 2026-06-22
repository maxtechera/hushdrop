## What & why

<!-- Brief summary of the change and the motivation. -->

## Surface touched
- [ ] CLI (`skill/drop.mjs`)
- [ ] MCP server (`skill/mcp.mjs`)
- [ ] Edge middleware / API (`middleware.js`, `api/`)
- [ ] Marketing/SEO site (`site/`, regenerated via `node skill/gen-site.mjs`)

## Checks
- [ ] `node --check` passes on changed JS
- [ ] If site files changed, I ran `node skill/gen-site.mjs` and committed the output
- [ ] `bash tests/run.sh` (if applicable)
