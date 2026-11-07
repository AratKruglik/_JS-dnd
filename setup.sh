#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is missing. Install it from https://nodejs.org and run this script again." >&2
  exit 1
fi

if ! node -e "require('node:sqlite')" >/dev/null 2>&1; then
  echo "This Node.js ($(node --version)) has no built-in SQLite (node:sqlite). Install a newer Node.js from https://nodejs.org and run this script again." >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! INIT_OUTPUT="$(node "$HERE/game/cli.js" init 2>&1)"; then
  echo "Could not create the game database. The game said:" >&2
  echo "$INIT_OUTPUT" >&2
  echo "If that mentions the dice, restore game/dice.js from the repo. Otherwise check that the data/ folder is writable, then run this script again." >&2
  exit 1
fi

echo "Setup complete"
