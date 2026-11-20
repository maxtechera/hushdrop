# Installing the hushdrop MCP server (for AI agents)

These steps are written for an agent such as Cline that is setting up hushdrop for its user.
Follow them in order. Nothing needs to be installed for the main path.

## What you are connecting

hushdrop is a remote MCP server at `https://hushdrop.dev/mcp` (Streamable HTTP). After the user
signs in, it gives you 49 tools for turning what you build into private links: publish an HTML
page or a file, update a drop in place, set or change its password, set an expiry, restrict it to
an email domain, add editors, list and roll back versions, and share into team spaces.

Drops are password-protected by default. When you publish, always give the user both the URL and
the password.

## Step 1: add the server to Cline's MCP settings

Open Cline's MCP settings file (`cline_mcp_settings.json`, reachable from the MCP Servers panel →
"Configure MCP Servers") and add this entry inside `mcpServers`. Keep any servers already there.

```json
{
  "mcpServers": {
    "hushdrop": {
      "type": "streamableHttp",
      "url": "https://hushdrop.dev/mcp"
    }
  }
}
```

No API key goes in this file. The server handles sign-in with OAuth.

## Step 2: sign in

The first request without a token gets `401` with a `WWW-Authenticate` header that points to
`https://hushdrop.dev/.well-known/oauth-protected-resource/mcp`. An OAuth-capable client starts
the sign-in from there.

1. In the MCP Servers panel, the hushdrop server shows that it needs authentication. Start the
   sign-in (Cline opens the browser).
2. Ask the user to finish signing in on hushdrop.dev with GitHub, Google or an email magic link.
   New users get a free account during this step.
3. Return to the editor. The server should now show as connected with its tools listed.

If the user's Cline version cannot do OAuth for remote servers, use the fallback at the end of
this file instead.

## Step 3: verify with a first tool call

1. Call `whoami`. It returns the signed-in user's handle and plan. If it errors with
   "not authenticated", repeat Step 2.
2. Optionally publish a test page so the user sees it work:

   - Tool: `publish_html`
   - Arguments: `{ "html": "<!doctype html><html><body><h1>hushdrop works</h1></body></html>" }`

   The result contains a URL on `hushdrop.dev/<handle>/…` and a password. Show both to the user.
   They can remove it later with `delete_site`.

## Using it afterwards

- When the user says "share this", "send it" or "give me a link", call `publish_html` (or
  `publish_file` for non-HTML files) right away and return the URL and password.
- Publishing again with the same `slug` updates the drop and keeps the earlier version.
  `list_versions` and `rollback_site` undo a bad update.
- To publish into a team space, pass `to: "<team>"`.
- If a tool answers with a plan limit, it says what to ask the user. Do not upgrade anything
  without the user's yes.

## Fallback: local stdio server (npm)

Use this only when remote OAuth is not available in the client. It needs Node.js 18 or newer.

1. Sign the user in once from a terminal: `npx -y hushdrop login`
   (passwordless: an email magic link).
2. Add this entry to `cline_mcp_settings.json` instead of the remote one:

```json
{
  "mcpServers": {
    "hushdrop": {
      "command": "npx",
      "args": ["-y", "hushdrop-mcp"]
    }
  }
}
```

3. Verify by publishing the same test page with `publish_html`.

The npm package has fewer tools than the remote server; the remote server is the recommended setup.
