#!/usr/bin/env bash
# Flow B1 — Connect-Vercel one-click self-host (the wedge).  PRD §13 B1.1–B1.6
# Phase 1 Path B (M2). Not yet built → SKIP until /self-host gains the OAuth flow.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/lib.sh"
echo "== Flow B1 — Connect-Vercel one-click self-host =="

SH="$BASE_URL/self-host"
sh_code="$(http_code "$SH")"
sh_body=""; [ "$sh_code" = "200" ] && sh_body="$(http_body "$SH")"
cb_code="$(http_code "$BASE_URL/api/vercel/callback")"

# B1.1 Vercel OAuth completes; we receive a token.
if printf '%s' "$sh_body" | grep -qiE 'sign in with vercel|connect[- ]vercel'; then
  if [ "$cb_code" != "404" ] && [ "$cb_code" != "000" ]; then
    pass B1.1 "/self-host has Connect-Vercel + /api/vercel/callback present (code=$cb_code)"
  else
    fail B1.1 "Connect-Vercel button present but OAuth callback endpoint missing (code=$cb_code)"
  fi
else
  skip B1.1 "Connect-Vercel OAuth not implemented on /self-host"
fi

# B1.2 auto-create project + Blob + env + deploy.
if [ "$cb_code" != "404" ] && [ "$cb_code" != "000" ]; then
  skip B1.2 "provisioning result needs a live Vercel OAuth grant (manual/integration)"
else
  skip B1.2 "auto-provision (project+blob+env+deploy) not implemented"
fi

# B1.3 live instance at user domain (or *.vercel.app) in <60s.
skip B1.3 "live-instance-in-<60s needs a real OAuth provision run (manual)"

# B1.4 user gets CLI config/key; publish goes to THEIR domain.
skip B1.4 "post-provision CLI key + own-domain publish needs a provisioned instance"

# B1.5 self-host token-only (no Supabase), free, unlimited.
# Structural: the self-host page should state token-only / no-account / free.
if printf '%s' "$sh_body" | grep -qiE 'token|no account|free|unlimited'; then
  pass B1.5 "/self-host documents token-only / free self-host"
else
  skip B1.5 "/self-host token-only-free messaging not present"
fi

# B1.6 no Vercel account → guide them to create one, or steer to Path A.
if [ "$cb_code" != "404" ] && [ "$cb_code" != "000" ]; then
  skip B1.6 "no-Vercel-account branch needs the live OAuth flow (manual)"
else
  skip B1.6 "no-Vercel-account handling not implemented (depends on Connect-Vercel)"
fi
