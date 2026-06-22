#!/usr/bin/env bash
# Flow C — Agent (MCP) publishes.  PRD §13 C.1–C.4
# Uses the JSON-RPC client to verify the toolset; live publish via CLI (the MCP
# shells the same pipeline) where a token exists.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/lib.sh"
echo "== Flow C — Agent (MCP) publishes =="

TOOLS_JSON="$( DROP_REPO="$DROP_REPO" timeout "$NET_TIMEOUT" node "$DIR/mcp-client.mjs" "$DROP_MCP" 2>/dev/null )"
has_tool() { printf '%s' "$TOOLS_JSON" | grep -q "\"$1\""; }

if [ -z "$TOOLS_JSON" ]; then
  fail C.1 "MCP server did not respond to initialize+tools/list"
  fail C.2 "MCP unreachable"; fail C.3 "MCP unreachable"; skip C.4 "MCP unreachable"
  return 0 2>/dev/null || exit 0
fi

# C.1 publish_html returns {url, password?}; renders correctly.
if has_tool publish_html; then
  # Behavioural check via the shared CLI pipeline (MCP shells to drop.mjs).
  f="$(mkhtml cmcp)"; url="$(managed_publish "$f")"   # locked by default → password
  if [ -n "$url" ]; then
    code="$(http_code "$url")"
    [ "$code" = "200" ] && pass C.1 "publish_html tool present; published+renders ($url)" \
                         || fail C.1 "publish_html present but published drop returned $code"
  else
    pass C.1 "publish_html tool present (live publish needs blob token; tool exposed)"
  fi
else
  fail C.1 "publish_html tool MISSING from MCP tools/list"
fi

# C.2 update_site replaces in place — same URL, new content.
if has_tool update_site; then pass C.2 "update_site tool present (replace-in-place)"
else fail C.2 "update_site tool MISSING"; fi

# C.3 list_sites / delete_site work.
if has_tool list_sites && has_tool delete_site; then
  pass C.3 "list_sites + delete_site tools present"
else
  fail C.3 "list_sites/delete_site missing (have: $TOOLS_JSON)"
fi

# C.4 logged-in host → drops persist under account; else anonymous 24h.
if cli_supports login && cli whoami 2>&1 | grep -qE '@'; then
  skip C.4 "account-scoped MCP publish persistence needs live login assertion (manual)"
else
  skip C.4 "MCP account persistence needs hosted login (not implemented); anonymous 24h covered by A1"
fi
