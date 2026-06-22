// Remote MCP endpoint — the "one-click" path for plain Claude.ai / ChatGPT (no CLI).
//
// Plain web agents can't run the client-side AES-256 encryption the local CLI/MCP does,
// so this hosted endpoint is the CONVENIENCE tier: it stores HTML server-side and returns
// a public, branded link that auto-deletes in 24h. (For zero-knowledge / password-protected
// publishing, use the local `hush` CLI or `npx -y hushdrop-mcp` — those encrypt before upload.)
//
// Stateless Streamable HTTP MCP (one server+transport per request) — fits Vercel functions.
// Connector URL: https://hushdrop.dev/api/mcp  (also /mcp via rewrite)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const ORIGIN = "https://hushdrop.dev";

function buildServer() {
  const server = new McpServer(
    { name: "hushdrop", version: "0.3.1" },
    { instructions: "Publish HTML artifacts as shareable links on hushdrop.dev. Use publish_html whenever the user wants to share, publish, or get a link for HTML you created." }
  );

  server.tool(
    "publish_html",
    "Publish an HTML document/artifact as a public, branded link on hushdrop.dev (auto-deletes in 24h). Returns the URL. Use when the user wants to share/publish/host an HTML page you generated, or asks for a link to it.",
    { html: z.string().describe("The complete HTML document to publish (include <html>…</html>).") },
    async ({ html }) => {
      try {
        const r = await fetch(`${ORIGIN}/api/publish`, {
          method: "POST",
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-drop-content-type": "text/html; charset=utf-8",
            "x-drop-brand": "1",
          },
          body: html,
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.url) {
          return { isError: true, content: [{ type: "text", text: `Publish failed (${r.status}): ${d.error || "unknown error"}` }] };
        }
        return { content: [{ type: "text", text: `Published → ${d.url}\n\nPublic link, auto-deletes in 24h. For a private/password-protected link on your own domain, use the hush CLI (npx hushdrop).` }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: `Publish error: ${String(e?.message || e)}` }] };
      }
    }
  );

  return server;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, mcp-session-id, mcp-protocol-version, last-event-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = buildServer();
    res.on("close", () => { try { transport.close(); server.close(); } catch {} });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: String(e?.message || e) }, id: null });
    }
  }
}
