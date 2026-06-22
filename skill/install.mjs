#!/usr/bin/env node
/**
 * hushdrop-install — wire the hushdrop MCP server (and `drop` CLI) into your agents.
 *
 * Open-source one-command installer. Unlike hosted installers there's NO sign-in step
 * (the managed tier is anonymous), so it's fewer steps. It:
 *   - registers the 'hushdrop' MCP in CLI agents (Claude Code, Codex, OpenCode, Amp)
 *   - writes/merges MCP config for GUI clients (Cursor, Claude Desktop, Windsurf)
 *   - symlinks `drop` onto your PATH and installs the skill for Claude/OpenClaw
 *
 *   npx hushdrop-install            # configure everything detected
 *   npx hushdrop-install --print    # show what it would do, change nothing
 */

import { spawnSync } from "node:child_process";
import { existsSync, symlinkSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = __dirname;
const MCP = join(__dirname, "mcp.mjs");
const DROP = join(__dirname, "drop.mjs");
const PRINT = process.argv.includes("--print");
const HOME = homedir();
const PLAT = platform();
const SEP = PLAT === "win32" ? "\\" : "/";

// When installed from npm, wire agents to the published runner; from a clone, the local file.
const PUBLISHED = __dirname.includes(`${SEP}node_modules${SEP}`);
const MCP_CMD = PUBLISHED ? ["npx", "-y", "hushdrop-mcp"] : [process.execPath, MCP];

const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const dim = (m) => console.log(`\x1b[2m${m}\x1b[0m`);
const has = (cmd) => spawnSync(PLAT === "win32" ? "where" : "which", [cmd], { stdio: "ignore", shell: PLAT === "win32" }).status === 0;

console.log("hushdrop-install — wiring the hushdrop MCP into your agents\n");
let wired = 0;

// 1. CLI agents via `<cli> mcp add`
for (const cli of ["claude", "codex", "opencode", "amp"]) {
  if (!has(cli)) continue;
  const args = ["mcp", "add", "hushdrop", "--", ...MCP_CMD];
  if (PRINT) { dim(`${cli} ${args.join(" ")}`); wired++; continue; }
  const r = spawnSync(cli, args, { stdio: ["ignore", "ignore", "ignore"], shell: PLAT === "win32" });
  if (r.status === 0) { ok(`registered hushdrop MCP in ${cli}`); wired++; }
  else dim(`skipped ${cli} (already configured?)`);
}

// 2. GUI MCP clients via their config files (only if the app's dir exists → app installed)
const appSupport = PLAT === "darwin" ? join(HOME, "Library", "Application Support")
  : PLAT === "win32" ? (process.env.APPDATA || join(HOME, "AppData", "Roaming"))
  : join(HOME, ".config");
const GUI = [
  { name: "Cursor", dir: join(HOME, ".cursor"), file: join(HOME, ".cursor", "mcp.json"), key: "mcpServers" },
  { name: "Claude Desktop", dir: join(appSupport, "Claude"), file: join(appSupport, "Claude", "claude_desktop_config.json"), key: "mcpServers" },
  { name: "Windsurf", dir: join(HOME, ".codeium", "windsurf"), file: join(HOME, ".codeium", "windsurf", "mcp_config.json"), key: "mcpServers" },
];
function mergeMcp(file, key) {
  let cfg = {};
  if (existsSync(file)) { try { cfg = JSON.parse(readFileSync(file, "utf8")); } catch { return false; } }
  cfg[key] = cfg[key] || {};
  cfg[key].hushdrop = { command: MCP_CMD[0], args: MCP_CMD.slice(1) };
  writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
  return true;
}
for (const g of GUI) {
  if (!existsSync(g.dir)) continue;
  if (PRINT) { dim(`write ${g.file} → ${g.key}.hushdrop`); wired++; continue; }
  try { mkdirSync(dirname(g.file), { recursive: true }); if (mergeMcp(g.file, g.key)) { ok(`configured ${g.name} (${g.file})`); wired++; } }
  catch (e) { dim(`skipped ${g.name}: ${e.message}`); }
}

if (!wired) dim("no agents detected — add the MCP config below by hand");

// 3. `drop` on PATH
const bin = join(HOME, ".local", "bin");
const link = join(bin, "hush");
if (PRINT) { dim(`ln -s ${DROP} ${link}`); }
else {
  try { mkdirSync(bin, { recursive: true }); if (existsSync(link)) rmSync(link); symlinkSync(DROP, link); ok(`linked 'hush' → ${link}`); }
  catch (e) { dim(`could not symlink drop: ${e.message}`); }
}

// 4. skill auto-discovery for Claude Code / OpenClaw
const skillsDir = join(HOME, ".claude", "skills");
if (existsSync(skillsDir) && !PUBLISHED) {
  const dest = join(skillsDir, "hushdrop");
  if (PRINT) { dim(`ln -s ${SKILL_DIR} ${dest}`); }
  else { try { if (existsSync(dest)) rmSync(dest, { recursive: true, force: true }); symlinkSync(SKILL_DIR, dest); ok(`installed skill → ${dest}`); } catch {} }
}

console.log("\nGUI clients not auto-detected? Add this to your MCP config:");
console.log(JSON.stringify({ mcpServers: { hushdrop: { command: MCP_CMD[0], args: MCP_CMD.slice(1) } } }, null, 2));
console.log("\nReady. Try:  hush report.html --managed   (zero setup)   ·   docs: https://hushdrop.maxtechera.dev/docs");
