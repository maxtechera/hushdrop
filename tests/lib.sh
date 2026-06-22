# tests/lib.sh — shared helpers for the drop acceptance suite.
# Sourced by every test file and by run.sh. POSIX-ish bash.
#
# Independence: assertions encode what PRD §13/§15/§16/§17 SAY must be true,
# not how current code happens to work. Features the PRD marks P1/P2/P3 and
# that are not yet built are probed and, when absent, reported SKIP
# (not implemented) so the suite is green today and flips to PASS/FAIL as
# features land (TDD).

set -u

# ---- locations -------------------------------------------------------------
# DROP_REPO = a live, installed checkout (has skill/node_modules + the blob
# token in .env.local). Tests run the CLI/MCP from there so they work today
# even though a fresh worktree's own node_modules is gitignored.
# Override with DROP_REPO=/path to point at any checkout.
: "${DROP_REPO:=/home/max/dev/drops-share}"
DROP_CLI="$DROP_REPO/skill/drop.mjs"
DROP_MCP="$DROP_REPO/skill/mcp.mjs"

# Public site under test.
: "${BASE_URL:=https://hushdrop.dev}"

# Per-test timeout for network/CLI calls (seconds).
: "${NET_TIMEOUT:=60}"

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMPDIR_DROP="$(mktemp -d 2>/dev/null || echo /tmp/drop-qa-$$)"
mkdir -p "$TMPDIR_DROP"

# ---- result accounting -----------------------------------------------------
# Each test appends "AC<TAB>RESULT<TAB>message" to $RESULT_FILE.
: "${RESULT_FILE:=$TMPDIR_DROP/results.tsv}"
# Truncate only for a standalone run; under run.sh (RUN_SUITE=1) the runner owns
# the shared results file and each sourced test must APPEND, not reset it.
if [ "${RUN_SUITE:-0}" != "1" ]; then : > "$RESULT_FILE" 2>/dev/null || true; fi

c_green=$'\033[32m'; c_red=$'\033[31m'; c_yellow=$'\033[33m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
if [ ! -t 1 ]; then c_green=; c_red=; c_yellow=; c_dim=; c_off=; fi

_emit() { # _emit AC RESULT message...
  local ac="$1" res="$2"; shift 2; local msg="$*"
  printf '%s\t%s\t%s\n' "$ac" "$res" "$msg" >> "$RESULT_FILE"
  case "$res" in
    PASS) printf '  %s[PASS]%s %-7s %s\n' "$c_green" "$c_off" "$ac" "$msg" ;;
    FAIL) printf '  %s[FAIL]%s %-7s %s\n' "$c_red"   "$c_off" "$ac" "$msg" ;;
    SKIP) printf '  %s[SKIP]%s %-7s %s\n' "$c_yellow" "$c_off" "$ac" "$msg" ;;
    *)    printf '  [%s] %-7s %s\n' "$res" "$ac" "$msg" ;;
  esac
}

pass() { _emit "$1" PASS "${2:-}"; }
fail() { _emit "$1" FAIL "${2:-}"; }
skip() { _emit "$1" SKIP "${2:-not implemented}"; }

# ---- tool wrappers ---------------------------------------------------------
cli() { ( cd "$DROP_REPO" && timeout "$NET_TIMEOUT" node "$DROP_CLI" "$@" ); }

http_code()    { curl -sS -o /dev/null -w '%{http_code}' --max-time "$NET_TIMEOUT" "$1" 2>/dev/null || echo 000; }
http_headers() { curl -sS -D - -o /dev/null --max-time "$NET_TIMEOUT" "$1" 2>/dev/null; }
http_body()    { curl -sS --max-time "$NET_TIMEOUT" "$1" 2>/dev/null; }
header_val()   { http_headers "$1" | grep -i "^$2:" | head -1 | sed "s/^[^:]*:[[:space:]]*//I" | tr -d '\r'; }

# ---- managed publish helper ------------------------------------------------
# Publishes a temp file to the managed/anonymous tier; echoes the /u/<slug> URL
# (empty on failure). Managed drops auto-expire in 24h (PRD A1.5); the CLI
# cannot rm /u/ drops, so there is nothing to clean up.
managed_publish() { # managed_publish <file> [extra cli args...]
  local f="$1"; shift || true
  cli "$f" --managed "$@" 2>/dev/null | grep -oE "$BASE_URL/u/[A-Za-z0-9_-]+" | head -1
}

mkhtml() { # mkhtml <marker> -> path to a temp html file containing marker
  local marker="$1"
  local p="$TMPDIR_DROP/probe-$marker-$RANDOM.html"
  printf '<!doctype html><html><head><title>QA %s</title></head><body><h1>%s</h1></body></html>\n' \
    "$marker" "$marker" > "$p"
  printf '%s\n' "$p"
}

# ---- capability probes -----------------------------------------------------
# Decide PASS/FAIL vs SKIP for not-yet-built commands by reading the CLI's own
# usage text (a black-box surface, not internals).
cli_supports() { cli 2>&1 | grep -qE "(^|[^a-z])drop[[:space:]]+$1([^a-z]|\$)"; }
cli_has_flag() { cli 2>&1 | grep -q -- "$1"; }

have_blob_token() {
  if [ -n "${BLOB_READ_WRITE_TOKEN:-}" ]; then echo yes; return; fi
  if [ -f "$HOME/.hushdrop/.env" ] && grep -q 'BLOB_READ_WRITE_TOKEN' "$HOME/.hushdrop/.env" 2>/dev/null; then echo yes; return; fi
  if [ -f "$DROP_REPO/.env.local" ] && grep -q 'BLOB_READ_WRITE_TOKEN' "$DROP_REPO/.env.local" 2>/dev/null; then echo yes; return; fi
  echo no
}

# http endpoint existence: returns 0 unless the path 404s / is absent.
endpoint_exists() { # endpoint_exists <url>
  local code; code="$(http_code "$1")"
  [ "$code" != "404" ] && [ "$code" != "000" ]
}

# mkhtml_canary <canary> -> html file with a NEUTRAL title and the canary only
# inside the body. For ZK checks: a preserved <title> can never false-positive.
mkhtml_canary() {
  local canary="$1"
  # Filename + <title> are NEUTRAL (the CLI derives the gate-page title from the
  # filename, and StatiCrypt shows that title in cleartext by design). The canary
  # lives only inside the document body, which must be encrypted in a locked drop.
  local p="$TMPDIR_DROP/quarterly-report-$RANDOM.html"
  printf '<!doctype html><html><head><title>Quarterly Report</title></head><body><p>%s</p></body></html>\n' "$canary" > "$p"
  printf '%s\n' "$p"
}

# fetch_settled <url> <canary>: fetch up to 3x (short sleeps); return the body
# once the canary is absent OR encryption markers appear (the encrypted blob has
# settled). Avoids a publish->serve propagation race producing a false leak.
fetch_settled() {
  local url="$1" canary="$2" body="" i=0
  while [ "$i" -lt 3 ]; do
    body="$(http_body "$url")"
    if ! printf '%s' "$body" | grep -q "$canary"; then printf '%s' "$body"; return 0; fi
    if printf '%s' "$body" | grep -qiE 'staticrypt|encrypted'; then printf '%s' "$body"; return 0; fi
    i=$((i+1)); sleep 2
  done
  printf '%s' "$body"
}

cleanup_tmp() { rm -rf "$TMPDIR_DROP" 2>/dev/null || true; }
