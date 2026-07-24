#!/usr/bin/env bash
# RRMetrics one-command installer
#   curl -fsSL https://raw.githubusercontent.com/Snoe0/rrmetrics/main/install.sh | bash
# or, from a cloned repo:
#   ./install.sh
set -euo pipefail

REPO_URL="https://github.com/Snoe0/rrmetrics.git"
DIR="rrmetrics"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\033[31mError: %s\033[0m\n' "$1" >&2; exit 1; }

# 1. Prerequisites
command -v node >/dev/null 2>&1 || fail "Node.js is required (v20 or newer). Install it from https://nodejs.org"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js v20+ required (found v$(node -v | tr -d v))"
command -v npm >/dev/null 2>&1 || fail "npm is required"

# 2. Get the code (skip clone when already inside the repo)
if [ ! -f package.json ] || ! grep -q '"rrmetrics"' package.json 2>/dev/null; then
  command -v git >/dev/null 2>&1 || fail "git is required to download RRMetrics"
  if [ -d "$DIR" ]; then
    bold "Existing $DIR/ directory found — updating"
    git -C "$DIR" pull --ff-only
  else
    bold "Downloading RRMetrics"
    git clone --depth 1 "$REPO_URL" "$DIR"
  fi
  cd "$DIR"
fi

# 3. Install dependencies and build the client
bold "Installing dependencies (this can take a minute)"
npm install

bold "Building the client"
npm run build

# 4. Done
bold "RRMetrics is installed!"
echo
echo "  Start it:            npm start"
echo "  Then open:           http://localhost:8459"
echo "  Try with demo data:  npm run seed-demo   (login: demo@example.com / demo1234)"
echo
echo "  Broker sync (Tradovate, TopstepX, Webull) is optional —"
echo "  see README.md for API credential setup."
