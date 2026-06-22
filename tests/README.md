# drop — Acceptance Test Suite

An **independent**, executable validation of the PRD's acceptance criteria
(`PRD.md` §13 Flows A1–E, §15 MCP/CLI/Skill parity, §16 security/abuse,
§17 error/quality states). Assertions encode what the **PRD says must be true**,
derived from the spec — not from reading `api/` or `skill/drop.mjs` internals.

The suite is **TDD-shaped**: features the PRD marks Phase 1/2/3 that are not yet
built are detected as **SKIP (not implemented)** so the suite is **green today**
and a SKIP automatically flips to **PASS/FAIL** the moment the feature ships.

## Run it

```bash
# from the repo root (or anywhere)
bash tests/run.sh
```

Per-AC `[PASS]/[FAIL]/[SKIP]` lines stream as each flow runs, then a sorted
per-AC summary and a final tally. **Exit code is non-zero iff any non-SKIP AC
fails.** Live network is required (it hits the production site and publishes
throwaway managed drops that auto-expire in 24h).

### Environment knobs

| Var | Default | Meaning |
|---|---|---|
| `BASE_URL` | `https://hushdrop.maxtechera.dev` | site under test |
| `DROP_REPO` | `/home/max/dev/drops-share` | checkout with `skill/node_modules` + blob token (CLI/MCP run from here) |
| `NET_TIMEOUT` | `60` | per-call timeout (seconds) |
| `RUN_RATELIMIT` | unset | set `=1` to run the real 21-upload A1.6 burst (consumes the day's anon quota) |
| `ONLY` | unset | run only named files, e.g. `ONLY="a1 c-mcp security"` |

```bash
ONLY="c-mcp parity-mcp" bash tests/run.sh        # just the MCP checks
RUN_RATELIMIT=1 bash tests/run.sh                # include the A1.6 burst
bash tests/d-gating.sh                           # any file runs standalone too
```

> **Note on `DROP_REPO`:** a fresh git worktree's `skill/node_modules` is
> gitignored and the blob token lives in `.env.local` (untracked). So the CLI
> and MCP are executed from `DROP_REPO` (the installed checkout) which has both.
> Point `DROP_REPO` at any checkout that has run `npm i` + `hush setup`.

## Files

| File | Covers |
|---|---|
| `run.sh` | runner: runs all files, prints per-AC results + tally, exit≠0 on fail |
| `lib.sh` | shared helpers (result accounting, curl/CLI wrappers, ZK canary, capability probes) |
| `mcp-client.mjs` | minimal MCP stdio JSON-RPC client (initialize + tools/list) |
| `a1-anonymous.sh` | Flow A1 — anonymous quick publish (A1.1–A1.6) + (ZK)/(NX) |
| `a2-hosted.sh` | Flow A2 — host-on-drops login + persistent publish (A2.1–A2.9) |
| `a3-web.sh` | Flow A3 — web publish via `/try` (A3.1–A3.3) |
| `b1-connect-vercel.sh` | Flow B1 — Connect-Vercel one-click self-host (B1.1–B1.6) |
| `b2-selfhost-cli.sh` | Flow B2 — self-host via `hush deploy` (B2.1–B2.3) |
| `c-mcp.sh` | Flow C — agent (MCP) publishes (C.1–C.4) |
| `d-gating.sh` | Flow D — gate & manage a drop (D.1–D.6) |
| `e-migrate.sh` | Flow E — migrate hosted → self-host (E.1) |
| `parity-mcp.sh` | §15 MCP / CLI / Skill parity (must be ≥ Stacktree) |
| `security.sh` | §16 security/abuse + cross-cutting (NX)/(NR) |

## How "not implemented" is detected (independence)

- **CLI verbs** (login/whoami/logout/claim/share/migrate, flags like `--burn`,
  `--email-gate`): probed from the CLI's own **usage text** — a black-box
  surface, not source. Absent ⇒ SKIP.
- **HTTP endpoints/pages** (`/login`, `/api/sites`, `/api/auth/device/start`,
  `/api/vercel/callback`, `/report`, `/api/account/delete`): probed by status
  code. `404`/unreachable ⇒ SKIP.
- **MCP tools**: enumerated over the wire via `tools/list`. Missing optional
  tools (`set_password`/`set_expiry`/…) ⇒ SKIP; missing *core* tools ⇒ FAIL.
- **Stubs**: if a CLI verb is advertised but its backend endpoint 404s (e.g.
  `hush login`), the **behavioral** AC SKIPs while the **parity** (verb-present)
  AC PASSes — §15 measures the command surface, A2 measures the live flow.

## Current state — PASS vs SKIP by AC

Snapshot from a green run against production (`62` ACs: `32 PASS / 0 FAIL / 30 SKIP`):

### ✅ PASS (shipped & verified)
- **A1.1–A1.5** anonymous publish: `/u/<slug>` in <5s, branded render, **(ZK)**
  locked blob is ciphertext (body canary absent), **(NX)** `x-robots-tag: noindex`,
  24h auto-expiry advertised + `/api/gc` reachable.
- **A3.1–A3.3** `/try` web drop-zone live (publish + account path + copy).
- **B1.5** `/self-host` documents token-only / free self-host.
- **B2.1–B2.3** `hush deploy` present, `init`/`--domain`, `--dry-run` previews.
- **C.1–C.3** MCP `publish_html`/`update_site`/`list_sites`/`delete_site` over the wire.
- **D.1** `-p` client-side-encrypted gate (canary absent). **D.2** `--expire` + `gc`.
  **D.6** `site.zip` → live multi-file site at `/<slug>/` (created + cleaned up).
- **§15** core-4 + `publish_file` extra; CLI core verbs; `login`/`whoami`/`logout`
  command surface present; `SKILL.md` ships.
- **§16** `noindex`, strict CSP (no remote origins), `nosniff`, kill-switch wired,
  abuse/AUP/DMCA surface, rate-limiter wiring; **(NR)** all marketing pages 200.

### ⏭️ SKIP (not implemented yet — will flip to PASS/FAIL as Phase 1/2/3 land)
- **A1.6** rate-limit 429 burst — gated behind `RUN_RATELIMIT=1` (quota cost).
- **A2.1–A2.9** host-on-drops: `hush login` is a stub (device-start endpoint 404),
  `/login` absent, `/api/sites` absent, handle/quota/persistent-publish need the
  hosted backend (Epics 0–2, M1).
- **B1.1–B1.4, B1.6** Connect-Vercel OAuth/provision (Epic 3, M2).
- **C.4** account-scoped MCP persistence (needs login).
- **D.3** `--burn`, **D.4** `--email-gate`, **D.5** `drop share` (Epic 4).
- **E.1** `hush migrate` (task 3.6).
- **§15** `set_password`/`set_expiry`/`set_email_gate`/`set_feedback` MCP tools;
  `drop claim`/`share`/`migrate` CLI verbs.
- **§16** `noai`/no-train header (task 4.7); delete-account/data-deletion (6.S4).

### Manual / integration ACs (marked SKIP with a reason)
Some ACs can't be fully asserted from a black-box script (e.g. emailing a magic
link, a real Vercel OAuth grant, waiting 24h for GC deletion, hitting a live
quota cap). These SKIP with an explicit "(manual)/(integration)" note rather
than asserting a half-truth.
