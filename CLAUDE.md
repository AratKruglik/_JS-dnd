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

## Languages

- Game text is English and Ukrainian. `node game/cli.js lang show` and `lang set <en|uk>` read and change the save language.
- Every player-facing string lives in `game/locales/{en,uk}.js` or `quests/text/{en,uk}.js`, never inline in a module. A lint rule enforces it for the player-facing modules.
- Ukrainian text is a draft until Gogi has reviewed it. Any new or changed Ukrainian text is added to `docs/i18n/uk-review-checklist.md` (the review gate).
- The Master brief `.claude/commands/play.md` and all developer text stay English.

## Hero vitals

- Health, gold, and items live in SQLite (`game/vitals.js`, `game/inventory.js`). The status line shows them above the stamina bar (`game/hero-line.js`). Max HP is the class hit die plus the CON modifier (`game/hero-stats.js`, `game/rules.js`).
- Gold and items are paid by `judgeQuest` and the fight engine, and taken back by `revokeSolve`. Nothing else writes them.

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
- Code style is Prettier (`.prettierrc.json`) plus ESLint (`eslint.config.js`). `game/dice.js` and `game/rolls.js` are excluded from both: they are fingerprinted together in `game/dice.sha256`, never format them. After an intended change run `node game/seal.js`.
- The player's quest files are checked with `eslint.player.config.js` and the same Prettier config (`game/style-check.js`).
- `bash setup.sh` checks Node and `node:sqlite`.
- `bash dev/github/seed.sh` is a dry run. `--apply` creates labels, the board, and issues, and must not be run again without Gogi's approval.
