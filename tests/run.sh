#!/usr/bin/env bash
# tests/run.sh — drop acceptance suite runner.
# Runs every flow file, prints per-AC PASS/FAIL/SKIP, then a tally.
# Exit non-zero if any non-SKIP fails.
#
# Env:
#   BASE_URL=https://hushdrop.maxtechera.dev   site under test
#   DROP_REPO=/home/max/dev/drops-share      checkout with skill/node_modules + token
#   NET_TIMEOUT=60                           per-call timeout (s)
#   RUN_RATELIMIT=1                          run the 21-upload A1.6 burst (consumes anon quota)
#   ONLY="a1 c"                              run only the named files (space/comma sep)
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export RESULT_FILE="$(mktemp)"
export RUN_SUITE=1
: > "$RESULT_FILE"
: "${BASE_URL:=https://hushdrop.maxtechera.dev}"; export BASE_URL
: "${DROP_REPO:=/home/max/dev/drops-share}"; export DROP_REPO
: "${NET_TIMEOUT:=60}"; export NET_TIMEOUT

# Order matters only for readability; tests are independent.
ALL=(a1-anonymous a2-hosted a3-web b1-connect-vercel b2-selfhost-cli c-mcp d-gating e-migrate parity-mcp security)

only="${ONLY:-}"; only="${only//,/ }"
run_one() {
  case " $only " in
    "  ") return 0 ;;                # empty ONLY → run all
    *" $1 "*) return 0 ;;            # exact match
    *) for tok in $only; do case "$1" in *"$tok"*) return 0;; esac; done; return 1 ;;
  esac
}

echo "drop acceptance suite — BASE_URL=$BASE_URL  DROP_REPO=$DROP_REPO"
echo "============================================================"
fail_files=0
for name in "${ALL[@]}"; do
  if [ -n "$only" ]; then run_one "$name" || continue; fi
  f="$DIR/$name.sh"
  [ -f "$f" ] || { echo "MISSING: $f"; continue; }
  echo
  # Each file sources lib.sh which appends to $RESULT_FILE (exported).
  bash "$f" || fail_files=$((fail_files+1))
done

echo
echo "============================================================"
echo "Per-AC results:"
# Sorted, stable.
sort -t$'\t' -k1,1 "$RESULT_FILE" 2>/dev/null | while IFS=$'\t' read -r ac res msg; do
  printf '  %-9s %-5s %s\n' "$ac" "$res" "$msg"
done

# Count by tab-delimited status field (awk avoids grep -c exit-code pitfalls).
p=$(awk -F'\t' '$2=="PASS"{n++} END{print n+0}' "$RESULT_FILE")
fl=$(awk -F'\t' '$2=="FAIL"{n++} END{print n+0}' "$RESULT_FILE")
s=$(awk -F'\t' '$2=="SKIP"{n++} END{print n+0}' "$RESULT_FILE")
tot=$((p+fl+s))
echo "------------------------------------------------------------"
printf 'TALLY: %d PASS / %d FAIL / %d SKIP  (%d ACs)\n' "$p" "$fl" "$s" "$tot"

if [ "$fl" -gt 0 ]; then
  echo "RESULT: RED ($fl failing)"; rm -f "$RESULT_FILE"; exit 1
else
  echo "RESULT: GREEN (0 failing; $s skipped/not-implemented)"; rm -f "$RESULT_FILE"; exit 0
fi
