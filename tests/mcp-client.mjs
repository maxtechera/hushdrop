#!/usr/bin/env node
/**
 * Minimal MCP stdio JSON-RPC client for the test suite.
 * Spawns `node <DROP_MCP>`, performs the initialize handshake, sends
 * tools/list, prints {"tools":[names...]} as JSON, exits 0. Errors → exit 1.
 *
 * Independent of server internals: speaks the wire protocol only.
 * Usage: node mcp-client.mjs /abs/path/to/skill/mcp.mjs
 */
import { spawn } from "node:child_process";

const mcpPath = process.argv[2];
if (!mcpPath) { console.error("usage: mcp-client.mjs <mcp.mjs>"); process.exit(2); }

const child = spawn("node", [mcpPath], {
  stdio: ["pipe", "pipe", "inherit"],
  cwd: process.env.DROP_REPO || process.cwd(),
});

let buf = "";
const pending = new Map();
let nextId = 1;

function send(method, params) {
  const id = nextId++;
  const msg = { jsonrpc: "2.0", id, method, params };
  child.stdin.write(JSON.stringify(msg) + "\n");
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result);
    }
  }
});

const timer = setTimeout(() => { console.error("MCP client timeout"); child.kill("SIGKILL"); process.exit(1); }, 25000);

try {
  await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "drop-qa", version: "1.0.0" },
  });
  notify("notifications/initialized", {});
  const list = await send("tools/list", {});
  const names = (list.tools || []).map((t) => t.name).sort();
  console.log(JSON.stringify({ tools: names }));
  clearTimeout(timer);
  child.kill("SIGTERM");
  process.exit(0);
} catch (e) {
  clearTimeout(timer);
  console.error("MCP error:", e.message);
  child.kill("SIGKILL");
  process.exit(1);
}
