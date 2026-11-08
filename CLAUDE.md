# CLAUDE.md - JS D&D Campaign

A D&D-style adventure played in the terminal where every quest is a JS task. Public repo: https://github.com/yamnyk/_JS-dnd

- Design spec: `docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md`. Read it before planning or building anything. Items marked `[My guess]` or `[Unchecked]` are not decisions.
- Plans live in `docs/superpowers/plans/`. Paste-ready plan-mode prompts: `docs/process/plan-mode-prompts.md`.
- Tasks: GitHub Issues and the "JS D&D" Projects board (project 3, owner `yamnyk`).

## Playing versus developing

- If the user ran `/play` (or just wants to play), you are the Dungeon Master. Follow `.claude/commands/play.md` and ignore every developer rule below: no dev greeting, no dev notes, no talk about plans or git.
- Otherwise you are building the game. The rules below apply.

## Working rules

- Claude makes the commits and pushes to origin/main after each finished piece. Plain commit messages. NEVER a `Co-Authored-By` line, a "Generated with Claude" line, or any Claude attribution in commits or PR text.
- Never force-push or rewrite pushed history without asking Gogi first.
- Ask before other outward-facing actions (GitHub issues, projects, posts).
- No em-dash or en-dash anywhere: code, comments, docs, commit text, output.
- Deterministic work belongs in scripts. The agent only does judgment work.
- Game state lives in SQLite reached through scripts. Never JSON or markdown files as game state.
- The dev notes DB (`.dev/dev.db`) is gitignored and separate from the game DB.

## Session start

The SessionStart hook prints the dev state (tasks, last completed, predictions, board). Greet Gogi with that current state, short, before anything else.

## Session end

Before the session ends, record state in the dev notes DB:

1. `node dev/cli.js task <issue> <todo|in_progress|blocked|done> "<title>" ["<detail>"]` for the current task.
2. If the task is done, `node dev/cli.js note completed <issue> "<what was completed>"`, stating exactly what was completed.
3. `node dev/cli.js note prediction - "<likely next step>"` for each predicted next step from the conversation. Predictions are guesses and stay labeled as such.

Run `node dev/cli.js status` to see what is currently recorded.

## Commands

- `node --test` runs all tests. They include a style test: `npm run lint` and `npm run format` fix what it flags.
- Code style is Prettier (`.prettierrc.json`) plus ESLint (`eslint.config.js`). `game/dice.js` is excluded from both: it is fingerprinted, never format it.
- The player's quest files are checked with `eslint.player.config.js` and the same Prettier config (`game/style-check.js`).
- `bash setup.sh` checks Node and `node:sqlite`.
- `bash dev/github/seed.sh` is a dry run. `--apply` creates labels, the board, and issues, and must not be run again without Gogi's approval.
