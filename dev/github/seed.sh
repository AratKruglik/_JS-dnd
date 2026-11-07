#!/usr/bin/env bash
# Creates labels, the project board, and issues from backlog.tsv.
# Dry run by default: prints the gh commands. Pass --apply to run them.
set -euo pipefail

OWNER="yamnyk"
REPO="yamnyk/_JS-dnd"
PROJECT_TITLE="JS D&D"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

show() {
  printf '%q ' "$@"
  echo
}

LABELS=(epic task plan-1 plan-2 plan-3 plan-4 plan-5 plan-6 plan-7)
for label in "${LABELS[@]}"; do
  show gh label create "$label" --repo "$REPO" --force
  [ "$APPLY" = 1 ] && gh label create "$label" --repo "$REPO" --force
done

show gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json --jq .number
if [ "$APPLY" = 1 ]; then
  # Reuse an existing project with this title so a re-run never creates a second board.
  PROJECT_NUMBER="$(gh project list --owner "$OWNER" --format json --jq ".projects[] | select(.title == \"$PROJECT_TITLE\") | .number" | head -n 1)"
  if [ -z "$PROJECT_NUMBER" ]; then
    PROJECT_NUMBER="$(gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json --jq .number)"
  fi
else
  PROJECT_NUMBER="<PROJECT_NUMBER>"
fi

# Existing issues (title, url) so a re-run, or a recovery after a partial failure, skips what exists.
EXISTING=""
if [ "$APPLY" = 1 ]; then
  EXISTING="$(gh issue list --repo "$REPO" --state all --limit 500 --json title,url --jq '.[] | [.title, .url] | @tsv')"
fi

show gh project link "$PROJECT_NUMBER" --owner "$OWNER" --repo "$REPO"
[ "$APPLY" = 1 ] && gh project link "$PROJECT_NUMBER" --owner "$OWNER" --repo "$REPO"

while IFS=$'\t' read -r title labels body; do
  [ -z "$title" ] && continue
  show gh issue create --repo "$REPO" --title "$title" --label "$labels" --body "$body"
  if [ "$APPLY" = 1 ]; then
    url="$(printf '%s\n' "$EXISTING" | awk -F'\t' -v t="$title" '$1 == t {print $2; exit}')"
    if [ -z "$url" ]; then
      url="$(gh issue create --repo "$REPO" --title "$title" --label "$labels" --body "$body")"
    else
      echo "exists, skipping create: $title"
    fi
    show gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$url"
    gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$url"
  fi
done < "$HERE/backlog.tsv"

if [ "$APPLY" = 1 ]; then
  echo "Project number: $PROJECT_NUMBER"
else
  echo "Dry run only. Nothing was created. Re-run with --apply to create everything."
fi
