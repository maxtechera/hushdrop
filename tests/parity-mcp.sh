#!/usr/bin/env bash
# §15 MCP / CLI / Skill parity (must be >= Stacktree).  PRD §15
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/lib.sh"
echo "== §15 MCP / CLI / Skill parity =="

TOOLS_JSON="$( DROP_REPO="$DROP_REPO" timeout "$NET_TIMEOUT" node "$DIR/mcp-client.mjs" "$DROP_MCP" 2>/dev/null )"
has_tool() { printf '%s' "$TOOLS_JSON" | grep -q "\"$1\""; }

# P15.have — the 4 'have' tools MUST be present (publish_html/update_site/list_sites/delete_site).
miss=""
for t in publish_html update_site list_sites delete_site; do has_tool "$t" || miss="$miss $t"; done
if [ -z "$miss" ]; then pass P15.have "core 4 MCP tools present (publish_html/update_site/list_sites/delete_site)"
else fail P15.have "missing core tools:$miss"; fi

# P15.extra — publish_file is the documented 'more' tool.
if has_tool publish_file; then pass P15.extra "publish_file extra tool present (beats Stacktree's 8)"
else fail P15.extra "publish_file (our extra) missing"; fi

# P15.set_password / set_expiry / set_email_gate / set_feedback — Phase 2/3.
for t in set_password set_expiry set_email_gate set_feedback; do
  if has_tool "$t"; then pass "P15.$t" "$t MCP tool present"
  else skip "P15.$t" "$t not implemented (PRD task 4.x)"; fi
done

# P15.cli-core — CLI verbs that already exceed Stacktree must exist.
miss=""
for v in list rm gc init setup deploy; do cli_supports "$v" || miss="$miss $v"; done
if [ -z "$miss" ]; then pass P15.cli-core "core CLI verbs present (list/rm/gc/init/setup/deploy)"
else fail P15.cli-core "missing CLI verbs:$miss"; fi

# P15.cli-auth — auth/account verbs (login/whoami/logout) Phase 1.
# Parity = the CLI command surface exists (>= Stacktree). Backend liveness for
# login/whoami is asserted separately in Flow A2; here we check verb presence.
for v in login whoami logout; do
  if cli_supports "$v"; then pass "P15.cli-$v" "drop $v command present (backend liveness: see A2)"
  else skip "P15.cli-$v" "drop $v not implemented (PRD 1.7/1.8)"; fi
done

# P15.cli-p2 — claim/share/migrate Phase 2/3.
for v in claim share migrate; do
  if cli_supports "$v"; then pass "P15.cli-$v" "drop $v present"
  else skip "P15.cli-$v" "drop $v not implemented (PRD 4.6/4.4/3.6)"; fi
done

# P15.skill — a SKILL.md with triggers must ship (distribution parity).
if [ -f "$DROP_REPO/skill/SKILL.md" ]; then pass P15.skill "skill/SKILL.md present (distributable skill)"
else fail P15.skill "skill/SKILL.md missing"; fi
