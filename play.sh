#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

# The oldest Claude Code this game supports: subagents skip CLAUDE.md from this version on. It was built and
# tested on 2.1.311. Older ones only get a warning.
MIN_VERSION="2.1.271"

if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code is not installed. Get it from https://claude.com/claude-code, then run this script again." >&2
  exit 1
fi

# True when $1 is older than $2, comparing each number of a.b.c as a number.
older_than() {
  local IFS=.
  local -a have=($1) need=($2)
  local i
  for i in 0 1 2; do
    if (( ${have[i]:-0} < ${need[i]:-0} )); then return 0; fi
    if (( ${have[i]:-0} > ${need[i]:-0} )); then return 1; fi
  done
  return 1
}

# A version that cannot be read is no reason to warn or to stop.
VERSION="$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
if [ -n "$VERSION" ] && older_than "$VERSION" "$MIN_VERSION"; then
  echo "Claude Code $VERSION is older than $MIN_VERSION, the oldest version this game supports. It may cost more tokens or miss features. Update Claude Code if anything looks off." >&2
fi

# The prompt goes first because --allowedTools takes a list and would swallow a prompt placed after it.
# The whole session starts on Sonnet, because a skill's model setting only lasts one turn. The game
# commands are pre-approved for this launch only: nothing is committed to the project settings.
# Extra arguments go last, for example: bash play.sh --continue
exec claude "/play" --model sonnet --allowedTools "Bash(node game/cli.js *)" "$@"
