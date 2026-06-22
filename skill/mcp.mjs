#!/usr/bin/env node
/**
 * hushdrop MCP server — the MCP-native publish primitive for HTML/artifacts your agents make.
 *
 * Open-source, self-hosted MCP publish primitive: an agent calls `publish_html` and gets
 * back a branded, password-protected, zero-knowledge link on YOUR own domain. Every tool
 * shells out to the `drop` CLI (drop.mjs --json) so the MCP and CLI share one pipeline.
 * Nothing is hosted by a third party — it's your Vercel Blob.
 *
 * Wire it into an agent (stdio):
 *   claude mcp add hushdrop -- npx -y hushdrop-mcp
 *   # or, from a checkout:
 *   claude mcp add hushdrop -- node <repo>/skill/mcp.mjs
 *
 * Requires `hush setup` to have run (BLOB_READ_WRITE_TOKEN in ~/.hushdrop/.env).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DROP = join(__dirname, "drop.mjs");

// Run the drop CLI with --json and return the parsed result.
function runDrop(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [DROP, ...args, "--json"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(err.trim() || `hush exited ${code}`));
      const line = out.trim().split("\n").filter(Boolean).pop() || "{}";
      try { resolve(JSON.parse(line)); } catch { resolve({ raw: out.trim() }); }
    });
  });
}

async function withTempFile(name, content, fn) {
  const dir = await mkdtemp(join(tmpdir(), "hushdrop-mcp-"));
  const path = join(dir, name);
  await writeFile(path, content);
  try { return await fn(path); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

const textResult = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const errResult = (e) => ({ isError: true, content: [{ type: "text", text: `Error: ${e.message || e}` }] });

const server = new McpServer({ name: "hushdrop", version: "1.0.0" });

server.tool(
  "publish_html",
  "Publish raw HTML as a branded, password-protected (zero-knowledge AES-256) link on your own domain. Returns the URL and (if locked) the password. Locked by default.",
  {
    html: z.string().describe("The full HTML document to publish."),
    slug: z.string().optional().describe("Force the URL slug (e.g. 'q3-report'). Otherwise auto-generated."),
    password: z.string().optional().describe("Set a specific password. Otherwise an unguessable one is generated when locked."),
    lock: z.boolean().optional().describe("Encrypt + password-protect (default true). Set false for a public branded page."),
    expire: z.string().optional().describe("Auto-expire after this long: '7d', '24h', '2w', or a date. Enforce deletion with the host's `hush gc` cron."),
  },
  async ({ html, slug, password, lock, expire }) => {
    try {
      const args = [];
      if (slug) args.push("-s", slug);
      if (lock === false) args.push("--no-lock");
      else if (password) args.push("-p", password);
      if (expire) args.push("--expire", expire);
      const res = await withTempFile((slug || "page") + ".html", html, (p) => runDrop([p, ...args]));
      return textResult(res);
    } catch (e) { return errResult(e); }
  }
);

server.tool(
  "publish_file",
  "Publish a file from a local path. Non-HTML files get an unguessable URL; pass page=true to wrap any file in a branded download page (optionally password-protected).",
  {
    path: z.string().describe("Absolute path to the local file to publish."),
    slug: z.string().optional(),
    page: z.boolean().optional().describe("Wrap the file in a branded download page."),
    password: z.string().optional().describe("Password-protect the download page (requires page=true)."),
  },
  async ({ path, slug, page, password }) => {
    try {
      const args = [path];
      if (slug) args.push("-s", slug);
      if (page) args.push("--page");
      if (password) args.push("-p", password);
      return textResult(await runDrop(args));
    } catch (e) { return errResult(e); }
  }
);

server.tool(
  "update_site",
  "Replace the content of an existing drop in place — same URL/slug, new HTML. (Set a password to re-lock; zero-knowledge means content can't be re-keyed without re-supplying it.)",
  {
    slug: z.string().describe("The slug to overwrite."),
    html: z.string().describe("The new HTML document."),
    password: z.string().optional(),
    lock: z.boolean().optional(),
    expire: z.string().optional().describe("Auto-expire: '7d', '24h', '2w', or a date."),
  },
  async ({ slug, html, password, lock, expire }) => {
    try {
      const args = ["-s", slug];
      if (lock === false) args.push("--no-lock");
      else if (password) args.push("-p", password);
      if (expire) args.push("--expire", expire);
      const res = await withTempFile(slug + ".html", html, (p) => runDrop([p, ...args]));
      return textResult(res);
    } catch (e) { return errResult(e); }
  }
);

server.tool(
  "list_sites",
  "List the drops currently live in your store (slug, URL, size, password if known locally, upload date).",
  {},
  async () => {
    try { return textResult(await runDrop(["list"])); }
    catch (e) { return errResult(e); }
  }
);

server.tool(
  "delete_site",
  "Delete a drop (and any sibling file) by slug. Burns the artifact immediately.",
  { slug: z.string().describe("The slug to delete.") },
  async ({ slug }) => {
    try { return textResult(await runDrop(["rm", slug])); }
    catch (e) { return errResult(e); }
  }
);

server.tool(
  "set_password",
  "Change the password gate on a hosted drop. Zero-knowledge means re-keying re-encrypts, so re-supply the HTML; returns the new URL + password.",
  {
    slug: z.string().describe("The slug to re-key."),
    html: z.string().describe("The drop's HTML (required — content is re-encrypted under the new password)."),
    password: z.string().optional().describe("New password (auto-generated if omitted)."),
  },
  async ({ slug, html, password }) => {
    try {
      const args = ["-s", slug];
      if (password) args.push("-p", password);
      return textResult(await withTempFile(slug + ".html", html, (p) => runDrop([p, ...args])));
    } catch (e) { return errResult(e); }
  }
);

server.tool(
  "set_expiry",
  "Set (or clear) the auto-expiry on a hosted drop. The host's gc cron deletes it after the deadline.",
  { slug: z.string(), expire: z.string().describe("'7d' | '24h' | '2w' | a date | 'off' to clear.") },
  async ({ slug, expire }) => {
    try { return textResult(await runDrop(["set-expiry", slug, expire])); }
    catch (e) { return errResult(e); }
  }
);

server.tool(
  "set_email_gate",
  "Restrict a hosted drop so only viewers with a given email domain can open it (e.g. 'acme.com'); pass 'off' to remove.",
  { slug: z.string(), domain: z.string().describe("Allowed email domain, or 'off'.") },
  async ({ slug, domain }) => {
    try { return textResult(await runDrop(["set-email-gate", slug, domain])); }
    catch (e) { return errResult(e); }
  }
);

server.tool(
  "set_feedback",
  "Toggle the viewer feedback widget on a hosted drop (collect reactions/comments from recipients).",
  { slug: z.string(), enabled: z.boolean().optional().describe("true to enable (default), false to disable.") },
  async ({ slug, enabled }) => {
    try { return textResult(await runDrop(["set-feedback", slug, enabled === false ? "off" : "on"])); }
    catch (e) { return errResult(e); }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
