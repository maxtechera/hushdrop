# Changelog

All notable changes to the `drop` CLI / MCP packages. Format: [Keep a Changelog](https://keepachangelog.com).

## [0.4.0] — 2026-06-24
### Added
- **Whole static sites from a folder or zip**: `hush ./dist` or `hush site.zip` uploads a multi-file static site under `/<slug>/` in one command — the root `index.html` is branded and gets a `<base href>` so relative links resolve. Skips `.git`/`node_modules`. Works with any build output (Next.js, Vite, Storybook…). Self-host only.
- **Whole-site password gate** (`hush ./dist -p secret`, self-host): one password protects the entire multi-file site via a server-side edge gate — a branded unlock page sets a signed, site-scoped session cookie. The server stores only a salted PBKDF2 verifier; the password never leaves your machine. (Single HTML files keep client-side zero-knowledge AES-256.) `hush deploy` provisions the gate secret automatically.

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
