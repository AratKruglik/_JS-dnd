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

echo "Setup complete"
