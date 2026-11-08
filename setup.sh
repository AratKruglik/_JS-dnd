#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prints how to get a working Node.js and stops. It installs nothing itself.
install_help() {
  cat >&2 <<'HELP'
Install the current Node.js release (this game was built on 25.8.1), then run this script again:
  macOS with Homebrew:  brew install node
  Linux or macOS:       install nvm from https://github.com/nvm-sh/nvm, then run: nvm install node
  Anywhere:             download the installer from https://nodejs.org
HELP
}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is missing." >&2
  install_help
  exit 1
fi

if ! node -e "require('node:sqlite')" >/dev/null 2>&1; then
  echo "This Node.js ($(node --version)) has no built-in SQLite (node:sqlite)." >&2
  install_help
  exit 1
fi

# Prettier and ESLint power the style check on quest files. The game plays without them.
if [ ! -x "$HERE/node_modules/.bin/prettier" ]; then
  if command -v npm >/dev/null 2>&1; then
    if ! npm install --no-audit --no-fund --prefix "$HERE" >/dev/null 2>&1; then
      echo "Could not install the style tools with npm, so the style check will be skipped. Run npm install in the game folder to turn it on." >&2
    fi
  else
    echo "npm was not found, so the style check will be skipped. Install npm and run npm install in the game folder to turn it on." >&2
  fi
fi

if ! INIT_OUTPUT="$(node "$HERE/game/cli.js" init 2>&1)"; then
  echo "Could not create the game database. The game said:" >&2
  echo "$INIT_OUTPUT" >&2
  echo "If that mentions the dice, restore game/dice.js from the repo. Otherwise check that the data/ folder is writable, then run this script again." >&2
  exit 1
fi

echo "Setup complete"
