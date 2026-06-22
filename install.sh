#!/bin/sh
# hushdrop installer — one command to get the `hush` CLI + MCP wired into your agents.
#   curl -fsSL https://hushdrop.dev/install.sh | sh
#
# Open-source, self-hosted artifact sharing. After this, try:  hush yourfile.html --managed
set -e

REPO="https://github.com/maxtechera/hushdrop"
DIR="${HUSHDROP_DIR:-$HOME/.hushdrop-src}"
BIN="$HOME/.local/bin"

say() { printf '\033[32m✓\033[0m %s\n' "$1"; }
dim() { printf '\033[2m%s\033[0m\n' "$1"; }

command -v node >/dev/null 2>&1 || { echo "hushdrop needs Node.js (>=18). Install it first: https://nodejs.org"; exit 1; }

dim "fetching hushdrop…"
if command -v git >/dev/null 2>&1; then
  if [ -d "$DIR/.git" ]; then git -C "$DIR" pull -q --ff-only || true; else rm -rf "$DIR"; git clone -q "$REPO" "$DIR"; fi
else
  command -v curl >/dev/null 2>&1 || { echo "need git or curl"; exit 1; }
  mkdir -p "$DIR"
  curl -fsSL "$REPO/archive/refs/heads/master.tar.gz" | tar xz -C "$DIR" --strip-components=1
fi

dim "installing dependencies…"
( cd "$DIR/skill" && npm install --no-audit --no-fund --loglevel error >/dev/null 2>&1 || npm install --no-audit --no-fund --loglevel error )

mkdir -p "$BIN"
ln -sf "$DIR/skill/drop.mjs" "$BIN/hush"
say "installed: hush → $BIN/hush"

case ":$PATH:" in
  *":$BIN:"*) : ;;
  *) dim "note: add $BIN to your PATH  (echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.profile)" ;;
esac

# wire the MCP into any detected agents (best-effort)
node "$DIR/skill/install.mjs" >/dev/null 2>&1 || true

printf '\n'
say "ready"
dim "  hush report.html --managed        # zero-setup, publishes to hushdrop.dev"
dim "  hush init --domain share.you.com  # then 'hush deploy' to run on your own domain"
