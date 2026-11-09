#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code is not installed. Get it from https://claude.com/claude-code, then run this script again." >&2
  exit 1
fi

# A skill's model setting only lasts one turn, so the whole session starts on Sonnet here.
# Extra arguments go to claude before the prompt, for example: bash play.sh --continue
exec claude --model sonnet "$@" "/play"
