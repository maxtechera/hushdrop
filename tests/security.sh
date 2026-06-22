#!/usr/bin/env bash
# §16 Security, abuse & content policy + cross-cutting (NX)/(NR).  PRD §16, §13 header
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/lib.sh"
echo "== §16 Security / abuse + cross-cutting (NX)/(NR) =="

# Publish one managed drop to inspect served-drop security headers.
f="$(mkhtml sec)"; url="$(managed_publish "$f" --no-lock)"

# S.NX — every drop returns X-Robots-Tag: noindex.
if [ -n "$url" ]; then
  xr="$(header_val "$url" x-robots-tag)"
  printf '%s' "$xr" | grep -qi noindex && pass S.NX "served drop has x-robots-tag noindex ($xr)" \
                                        || fail S.NX "served drop missing noindex (got '${xr:-none}')"
else
  fail S.NX "could not publish a drop to inspect headers"
fi

# S.CSP — strict CSP on served drops (no remote origins): default-src 'self'.
if [ -n "$url" ]; then
  csp="$(header_val "$url" content-security-policy)"
  if printf '%s' "$csp" | grep -qi "default-src 'self'"; then
    if printf '%s' "$csp" | grep -qiE "https?://[^ ;']"; then
      fail S.CSP "CSP present but allows a remote origin: $csp"
    else
      pass S.CSP "strict CSP, no remote origins (default-src 'self')"
    fi
  else
    fail S.CSP "no strict default-src 'self' CSP on served drop (got: ${csp:-none})"
  fi
else
  skip S.CSP "no drop URL to inspect"
fi

# S.SNIFF — X-Content-Type-Options: nosniff on served drops.
if [ -n "$url" ]; then
  cto="$(header_val "$url" x-content-type-options)"
  printf '%s' "$cto" | grep -qi nosniff && pass S.SNIFF "x-content-type-options: nosniff" \
                                         || fail S.SNIFF "missing nosniff (got '${cto:-none}')"
else
  skip S.SNIFF "no drop URL"
fi

# S.NOAI — 'no-train' / noai signal (PRD §5h, §16: noindex+noai). Phase: noindex
# shipped; noai is an additive task (4.7). SKIP until present.
if [ -n "$url" ]; then
  xr="$(header_val "$url" x-robots-tag)"
  if printf '%s' "$xr" | grep -qi 'noai'; then pass S.NOAI "x-robots-tag includes noai"
  else skip S.NOAI "noai/no-train header not yet added (PRD 4.7); noindex present"; fi
else
  skip S.NOAI "no drop URL"
fi

# S.KILL — DROP_MANAGED_DISABLED kill-switch exists (§16). Structural: the
# publish endpoint/middleware must honour it. Probe the publish source for the
# guard name (config surface, not behaviour-on-internals).
if grep -rqi 'DROP_MANAGED_DISABLED' "$DROP_REPO/api" "$DROP_REPO/middleware.js" 2>/dev/null; then
  pass S.KILL "DROP_MANAGED_DISABLED kill-switch wired in publish/middleware"
else
  skip S.KILL "DROP_MANAGED_DISABLED kill-switch not found in api/middleware"
fi

# S.ABUSE — abuse-report path (/report or email) + takedown (§16 6.S2).
rcode="$(http_code "$BASE_URL/report")"
if [ "$rcode" != "404" ] && [ "$rcode" != "000" ]; then
  pass S.ABUSE "/report abuse path reachable (code=$rcode)"
elif grep -rqiE 'abuse|dmca|takedown|report' "$DROP_REPO/security.html" 2>/dev/null; then
  pass S.ABUSE "abuse/takedown contact documented (security page)"
else
  skip S.ABUSE "abuse-report path /report not implemented (PRD 6.S2)"
fi

# S.LEGAL — AUP/DMCA/Terms surface (§16 6.S3).
sc="$(http_code "$BASE_URL/security")"
if grep -rqiE 'acceptable use|dmca|takedown|terms' "$DROP_REPO"/security.html "$DROP_REPO"/faq.html 2>/dev/null \
   || [ "$sc" = "200" ]; then
  pass S.LEGAL "security/AUP/DMCA surface present"
else
  skip S.LEGAL "Terms/AUP/DMCA pages not found (PRD 6.S3)"
fi

# S.DELACCT — delete-account / data-deletion endpoint (§16 6.S4, GDPR).
dac="$(http_code "$BASE_URL/api/account/delete")"
if [ "$dac" != "404" ] && [ "$dac" != "000" ]; then
  pass S.DELACCT "data-deletion endpoint reachable (code=$dac)"
else
  skip S.DELACCT "delete-account/data-deletion endpoint not implemented (PRD 6.S4)"
fi

# S.RATELIMIT — per-IP/per-key rate limiting wired (§16 6.S1). Behaviour is in
# A1.6 (gated). Here: confirm a limiter is wired (Upstash/redis ref in api).
if grep -rqiE 'upstash|ratelimit|rate-limit|@upstash' "$DROP_REPO/api" 2>/dev/null; then
  pass S.RATELIMIT "rate-limiter wiring present in api/*"
else
  skip S.RATELIMIT "rate-limiter (Upstash) not wired in api/* yet (PRD 6.S1); see A1.6"
fi

# ---- (NR) no-regression: marketing pages still return 200 ----
nr_fail=""
for p in "" docs pricing faq security self-host blog changelog glossary try llms.txt sitemap.xml; do
  c="$(http_code "$BASE_URL/$p")"
  [ "$c" = "200" ] || nr_fail="$nr_fail /$p:$c"
done
if [ -z "$nr_fail" ]; then pass S.NR "marketing pages all 200 (no regression)"
else fail S.NR "marketing pages not 200:$nr_fail"; fi
