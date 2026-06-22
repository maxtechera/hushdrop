# Changelog

All notable changes to the `drop` CLI / MCP packages. Format: [Keep a Changelog](https://keepachangelog.com).

## [0.2.2] — 2026-06-20
### Fixed
- `hush login` no longer hangs: the browser opener is non-blocking (was `spawnSync`).

## [0.2.1] — 2026-06-20
### Fixed
- Logged-in single HTML/Markdown publishes now go to your hosted account (`/<handle>/<slug>`); zip sites and arbitrary files fall through to self-host.
- `drop --help` / `-h` no longer errors.

## [0.2.0] — 2026-06-20
### Added
- **Hosted tier**: `hush login` (passwordless magic-link + GitHub OAuth + device pairing), persistent `/<handle>/<slug>` drops, `hush whoami` / `logout` / `list` / `rm` against your account.
- **Gating & sharing**: `--burn` (burn-after-read), `--email-gate`, `drop share` (revocable links), `drop claim`, `hush migrate`.
- **MCP** grew to 9 tools (added `set_password`, `set_expiry`, `set_email_gate`, `set_feedback`).
- Client-side **PII/secret scan** at publish (`--block-pii`).
- One-click self-host (Deploy to Vercel auto-provisions Blob; middleware derives the store from the token).

## [0.1.x] — 2026-06
- Initial CLI + MCP, managed (anonymous) tier, zip/multi-file sites, markdown, expiry + `gc`, branded password gates.
