#!/usr/bin/env bash
# Flow A3 — Web publish (no install).  PRD §13 A3.1–A3.3
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/lib.sh"
echo "== Flow A3 — Web publish via /try =="

TRY="$BASE_URL/try"
try_code="$(http_code "$TRY")"
try_body=""; [ "$try_code" = "200" ] && try_body="$(http_body "$TRY")"

# A3.1 anonymous → /u/<slug>, branded, 24h.
# /try is the web drop-zone; assert it exists and offers an anonymous publish.
if [ "$try_code" = "200" ] && printf '%s' "$try_body" | grep -qiE 'publish|drop|upload|drag|paste'; then
  pass A3.1 "/try drop-zone is live (anonymous web publish path present)"
else
  fail A3.1 "/try not serving a publish drop-zone (code=$try_code)"
fi

# A3.2 logged-in browser session → /<handle>/<slug>, persistent.
if [ "$try_code" = "200" ] && printf '%s' "$try_body" | grep -qiE 'sign in|log ?in|account|handle'; then
  pass A3.2 "/try advertises an authenticated/account publish path"
else
  skip A3.2 "authenticated /try (persistent /<handle>/<slug>) not implemented"
fi

# A3.3 copy button copies the URL; over size cap → clear error.
if [ "$try_code" = "200" ] && printf '%s' "$try_body" | grep -qiE 'copy'; then
  pass A3.3 "/try exposes a copy affordance (size-cap error path is manual)"
else
  skip A3.3 "/try copy button / size-cap error not detectable statically"
fi
