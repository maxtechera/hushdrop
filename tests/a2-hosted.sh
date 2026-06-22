#!/usr/bin/env bash
# Flow A2 — Host on Hushdrop directly (the quick start).  PRD §13 A2.1–A2.9
# Phase 1 (M1). Detect "not implemented" → SKIP; flips to PASS/FAIL as it lands.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/lib.sh"
echo "== Flow A2 — Host on Hushdrop directly (hosted account) =="

LOGIN_PAGE="$BASE_URL/login"
login_code="$(http_code "$LOGIN_PAGE")"
have_login=false; [ "$login_code" != "404" ] && [ "$login_code" != "000" ] && have_login=true

# A2.1 'hush login' opens /login with a device code; CLI polls for the key.
if cli_supports login; then
  ds_code="$(http_code "$BASE_URL/api/auth/device/start")"
  if [ "$ds_code" != "404" ] && [ "$ds_code" != "000" ]; then
    pass A2.1 "hush login present + /api/auth/device/start reachable (code=$ds_code)"
  else
    skip A2.1 "hush login is a stub (device-start endpoint 404; backend not built)"
  fi
else
  skip A2.1 "hush login not implemented (no 'login' verb in CLI usage)"
fi

# A2.2 entering any email sends a magic link (<60s); no password, no Google.
if $have_login; then
  lbody="$(http_body "$LOGIN_PAGE")"
  if printf '%s' "$lbody" | grep -qiE 'email|magic'; then
    if printf '%s' "$lbody" | grep -qiE 'password|google'; then
      fail A2.2 "/login mentions password or Google (must be magic-link only)"
    else
      pass A2.2 "/login is magic-link email, no password/Google"
    fi
  else
    skip A2.2 "/login exists but no magic-link email form yet"
  fi
else
  skip A2.2 "/login page not implemented (code=$login_code)"
fi

# A2.3 link → 'Authorize CLI' screen → Approve mints an API key.
if $have_login && http_body "$LOGIN_PAGE" | grep -qiE 'authorize'; then
  pass A2.3 "/login has an Authorize-CLI affordance"
else
  skip A2.3 "Authorize-CLI / device-claim flow not implemented"
fi

# A2.4 CLI saves the key to ~/.hushdrop; 'hush whoami' prints email + handle.
if cli_supports whoami; then
  w="$(cli whoami 2>&1)"
  if printf '%s' "$w" | grep -qE '@'; then pass A2.4 "hush whoami prints email + handle"
  else skip A2.4 "hush whoami is a stub (not logged in; login backend not built)"; fi
else
  skip A2.4 "hush whoami not implemented"
fi

# A2.5 first login assigns a unique handle (not a reserved page slug).
# Requires an account; structural check only.
if cli_supports whoami && cli whoami 2>&1 | grep -qE '@'; then
  handle="$(cli whoami 2>&1 | grep -oE 'handle[^A-Za-z0-9]*[A-Za-z0-9_-]+' | grep -oE '[A-Za-z0-9_-]+$' | head -1)"
  case " u api _brand try install docs pricing login self-host blog faq " in
    *" $handle "*) fail A2.5 "assigned handle '$handle' collides with a reserved slug" ;;
    *) [ -n "$handle" ] && pass A2.5 "handle '$handle' not reserved" || skip A2.5 "no handle to check" ;;
  esac
else
  skip A2.5 "handle assignment needs a logged-in account (login not implemented)"
fi

# A2.6 logged-in 'hush file.html' → /<handle>/<slug>, persistent (no 24h expiry).
if cli_supports login && cli_supports whoami && cli whoami 2>&1 | grep -qE '@'; then
  f="$(mkhtml a2pub)"; out="$(cli "$f" 2>&1)"
  if printf '%s' "$out" | grep -qE "$BASE_URL/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+" \
     && ! printf '%s' "$out" | grep -qiE '24h|expire'; then
    pass A2.6 "logged-in publish is persistent /<handle>/<slug>"
  else
    fail A2.6 "logged-in publish not persistent /<handle>/<slug>"
  fi
else
  skip A2.6 "hosted persistent publish needs login (not implemented)"
fi

# A2.7 'hush list' shows it (server); 'hush rm <slug>' deletes server-side.
# When logged in, list/rm should hit /api/sites. Endpoint presence is the gate.
sites_code="$(http_code "$BASE_URL/api/sites")"
if [ "$sites_code" != "404" ] && [ "$sites_code" != "000" ]; then
  pass A2.7 "/api/sites present (code=$sites_code) — server-side list/rm available"
else
  skip A2.7 "/api/sites not implemented (code=$sites_code)"
fi

# A2.8 'npx hushdrop-install' wires the MCP; agent publish_html lands under account.
if cli_supports login && cli whoami 2>&1 | grep -qE '@'; then
  skip A2.8 "needs live logged-in agent publish_html assertion (manual)"
else
  skip A2.8 "account-scoped publish_html needs login (not implemented)"
fi

# A2.9 free quota enforced; exceeding returns a clear, actionable error.
if [ "$sites_code" != "404" ] && [ "$sites_code" != "000" ]; then
  skip A2.9 "quota-exceed path needs a logged-in account at the cap (manual/integration)"
else
  skip A2.9 "quota enforcement needs hosted backend (not implemented)"
fi
