#!/usr/bin/env bash
# e-site-gating: folder upload + edge password gate end-to-end. Requires a self-host
# deployment (HUSH_BASE) with HUSH_GATE_SECRET set and a Blob token configured locally.
set -euo pipefail
DROP="node $(dirname "$0")/../skill/drop.mjs"

echo "→ public site (no -p)"
PUB=$($DROP ./tests/fixtures/site --no-pii-check --json | tee /dev/stderr | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
curl -fsS "$PUB" | grep -q "home" && echo "  ✓ public index loads"
curl -fsS "${PUB}about.html" | grep -q "about page" && echo "  ✓ public subpage loads"
curl -fsS "${PUB}assets/app.css" | grep -q "ff6b35" && echo "  ✓ public asset loads"

echo "→ locked site (-p test123)"
LOCK=$($DROP ./tests/fixtures/site -p test123 --no-pii-check --json | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
SLUG=$(basename "${LOCK%/}")
test "$(curl -s -o /dev/null -w '%{http_code}' "$LOCK")" = "401" && echo "  ✓ locked root → 401 unlock page"
test "$(curl -s -o /dev/null -w '%{http_code}' "${LOCK}assets/app.css")" = "401" && echo "  ✓ locked asset gated"
test "$(curl -s -o /dev/null -w '%{http_code}' "${LOCK}.hush.json")" = "404" && echo "  ✓ verifier hidden (404)"

echo "→ wrong then right password"
test "$(curl -s -o /dev/null -w '%{http_code}' -d "slug=$SLUG&password=nope" "${HUSH_BASE}/api/unlock")" = "401" && echo "  ✓ wrong password → 401"
COOKIE=$(curl -s -i -d "slug=$SLUG&password=test123&next=/$SLUG/" "${HUSH_BASE}/api/unlock" | grep -i '^set-cookie:' | sed 's/set-cookie: //I;s/;.*//')
curl -fsS -H "Cookie: $COOKIE" "$LOCK" | grep -q "home" && echo "  ✓ correct password unlocks the site"
curl -fsS -H "Cookie: $COOKIE" "${LOCK}about.html" | grep -q "about page" && echo "  ✓ cookie carries to subpages"

echo "→ cleanup"
$DROP rm "$SLUG"; $DROP rm "$(basename "${PUB%/}")"
echo "ALL PASS"
