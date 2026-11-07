# Foundation and Tracking Implementation Plan (Plan 1 of 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the project a dev-only SQLite notes DB, a session start/end routine that loads and saves task state, a GitHub board seeded with the backlog, a minimal setup script, and a plan-mode prompt for each of the seven plans.

**Architecture:** Plain Node ES modules with zero npm dependencies, using the built-in `node:sqlite` and `node:test`. A small library (`dev/`) owns the notes DB. A CLI and a SessionStart hook call it. GitHub is reached only through `gh`. Deterministic work is code; the AI only decides what to write into notes.

**Tech Stack:** Node.js (`node:sqlite`, `node:test`), SQLite, bash, `gh` CLI, Claude Code project hooks.

**Spec:** `docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md` (sections 6, 7, 8 matter most here).

## Global Constraints

- Em-dash (U+2014) and en-dash (U+2013) never appear anywhere: code, comments, tests, docs, commit text, generated output.
- No git commands unless the owner asks. This plan has no commit steps; each task ends with a checkpoint where the owner decides about git.
- Ask the owner before any outward-facing action (creating the GitHub project, labels, or issues).
- Dev notes DB is SQLite, gitignored, and separate from the game DB (the repo is public and the game DB ships to players).
- Every DB connection sets WAL, `synchronous=NORMAL`, a busy timeout, and `foreign_keys=ON`.
- No JSON or markdown files as game state. (Dev tooling files like `package.json`, backlog data, and docs are not game state.)
- One setup script after cloning, no Docker.
- Scripts over agents for deterministic work.
- Claude Code is the first host.
- Needs Node.js for the player's own code (spec section 4, a guess); the minimum Node version for `node:sqlite` is unverified, so setup probes capability instead of comparing versions.

## Review Focus

Failure modes the spec implies but a happy-path build would miss, most likely first. Each has a test in the owning task.

1. Fresh clone, no dev DB yet: session start must not crash and must say there is nothing recorded (Task 4).
2. `gh` missing, logged out, or offline: session start prints a one-line board-unavailable notice, exits 0, and never hangs (Task 3, Task 4).
3. A GitHub issue title containing an em-dash or en-dash must not leak into output (Task 3).
4. Note text with quotes, newlines, and emoji is stored and returned verbatim (Task 2).
5. The hook runs from any working directory: paths resolve from the script location, not the cwd (Task 4).

---

## File Structure

| Path | Responsibility |
|---|---|
| `package.json` | `type: module`, `test` script, no dependencies |
| `.gitignore` | `.dev/`, `node_modules/` |
| `dev/db.js` | Open the dev DB, apply pragmas, create schema |
| `dev/notes.js` | Task and note reads/writes |
| `dev/board.js` | Read the GitHub board through `gh` |
| `dev/greeting.js` | Pure text rendering of state plus board |
| `dev/cli.js` | Commands for the agent to record state |
| `dev/session-start.js` | Hook entry: prints state, never fails |
| `.claude/settings.json` | Registers the SessionStart hook |
| `CLAUDE.md` | Session start and session end rules for the agent |
| `setup.sh` | Player-facing skeleton: Node and `node:sqlite` checks |
| `dev/github/seed.sh` + `dev/github/backlog.tsv` | Create labels and issues, dry-run by default |
| `docs/process/plan-mode-prompts.md` | One paste-ready plan-mode prompt per plan |
| `tests/**/*.test.js` | `node:test` suites |

---

### Task 1: Dev DB module

**Files:**
- Create: `package.json`, `.gitignore`, `dev/db.js`, `tests/dev/db.test.js`

**Interfaces:**
- Produces: `openDevDb(path?: string): DatabaseSync`. Default path is the env var `JSDND_DEV_DB` if set, else `<repo root>/.dev/dev.db` resolved from `import.meta.url`. Creates missing directories. Schema:
  - `tasks(issue_number INTEGER PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('todo','in_progress','blocked','done')), detail TEXT, updated_at TEXT NOT NULL)`
  - `notes(id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, issue_number INTEGER REFERENCES tasks(issue_number), kind TEXT NOT NULL CHECK(kind IN ('status','completed','prediction')), body TEXT NOT NULL)`
  - `meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)`

- [ ] **Step 1: Write the failing tests** in `tests/dev/db.test.js`, using a temp dir helper `fresh()` that returns `openDevDb(join(tmp, 'nested', 'dev.db'))`:
  - `openDevDb creates missing directories and applies pragmas`: `PRAGMA foreign_keys` is `1`, `PRAGMA journal_mode` is `'wal'`, `PRAGMA busy_timeout` column `timeout` is `5000`.
  - `schema rejects an unknown task status`: inserting status `'finished'` throws.
  - `schema enforces the notes foreign key`: inserting a note with `issue_number` 999 and no such task throws.
  - `schema rejects an unknown note kind`: kind `'rumor'` throws.
- [ ] **Step 2: Run** `node --test tests/dev/db.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `dev/db.js` with the signature above plus `package.json` (`{"name":"js-dnd","private":true,"type":"module","scripts":{"test":"node --test"}}`) and `.gitignore`. Use `DatabaseSync` from `node:sqlite` and `CREATE TABLE IF NOT EXISTS`.
- [ ] **Step 4: Run** `node --test tests/dev/db.test.js`. Expected: PASS (4 tests).
- [ ] **Step 5: Checkpoint.** Tell the owner which files changed. Do not run git.

---

### Task 2: Notes API

**Files:**
- Create: `dev/notes.js`, `tests/dev/notes.test.js`

**Interfaces:**
- Consumes: `openDevDb` from Task 1.
- Produces:
  - `setTask(db, { issueNumber: number, title: string, status: TaskStatus, detail?: string }): void` (upsert, sets `updated_at` to ISO now)
  - `addNote(db, { issueNumber: number | null, kind: 'status' | 'completed' | 'prediction', body: string }): number` (returns the new id)
  - `getState(db): { tasks: Task[], lastCompleted: Note | null, predictions: Note[] }` where tasks are ordered by `updated_at` descending, `predictions` are the 5 newest `prediction` notes newest first, and `lastCompleted` is the newest `completed` note.

- [ ] **Step 1: Write the failing tests** in `tests/dev/notes.test.js`:
  - `setTask upserts by issue number`: two calls for issue 7 with `todo` then `in_progress` leave one row with `in_progress`.
  - `addNote stores text verbatim`: body `'He said "stop"\nthen 🎲 left'` round-trips unchanged through `getState` (via a `prediction` note).
  - `getState.lastCompleted is the newest completed note and null when none`.
  - `getState.predictions returns at most 5, newest first`: add 7, assert length 5 and order.
  - `addNote accepts a null issue and rejects an unknown issue`: null works, issue 999 throws.
- [ ] **Step 2: Run** `node --test tests/dev/notes.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the three functions in `dev/notes.js`. Parameterized statements only.
- [ ] **Step 4: Run** the same command. Expected: PASS (5 tests).
- [ ] **Step 5: Checkpoint.** Report changed files. No git.

---

### Task 3: Board reader and greeting renderer

**Files:**
- Create: `dev/board.js`, `dev/greeting.js`, `tests/dev/greeting.test.js`, `tests/dev/board.test.js`

**Interfaces:**
- Consumes: `getState` result shape from Task 2.
- Produces:
  - `type BoardItem = { number: number, title: string, status: string }`
  - `fetchBoard({ owner: string, number: number }, run?: (cmd: string, args: string[]) => string): { ok: true, items: BoardItem[] } | { ok: false, reason: string }`. `run` defaults to `execFileSync` with a 10 second timeout. It never throws.
  - `renderGreeting(state: State, board: BoardResult): string`. Pure. Sections: `Confirmed state`, `Predictions (not confirmed)`, `Board`. Replaces U+2013 and U+2014 with `-` in any text it prints.

- [ ] **Step 1: Capture the real `gh` output shape.** Ask the owner for the project number, or skip until Task 6 creates it, then run `gh project item-list <n> --owner yamnyk --format json` once and save a trimmed copy as `tests/fixtures/item-list.json`. If no board exists yet, do this step at the end of Task 6 and come back. The `fetchBoard` mapping must be written against the real shape, not a guess.
- [ ] **Step 2: Write the failing tests:**
  - `renderGreeting with empty state and unavailable board` contains `No tasks recorded yet` and `Board unavailable: gh not found`.
  - `renderGreeting keeps confirmed state and predictions in separate sections`.
  - `renderGreeting strips em-dashes and en-dashes` from a board title like `Setup - phase - one` (output contains `Setup - phase - one`).
  - `fetchBoard returns ok false when the runner throws` with reason containing the thrown message.
  - `fetchBoard maps the fixture to BoardItem[]` using the captured fixture.
- [ ] **Step 3: Run** `node --test tests/dev/greeting.test.js tests/dev/board.test.js`. Expected: FAIL.
- [ ] **Step 4: Implement** both modules.
- [ ] **Step 5: Run** the same command. Expected: PASS (5 tests).
- [ ] **Step 6: Checkpoint.** Report changed files. No git.

---

### Task 4: CLI, session-start hook, and agent rules

**Files:**
- Create: `dev/cli.js`, `dev/session-start.js`, `.claude/settings.json`, `CLAUDE.md`, `tests/dev/cli.test.js`, `tests/dev/session-start.test.js`

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces CLI commands (all honor `JSDND_DEV_DB`):
  - `node dev/cli.js task <issue> <todo|in_progress|blocked|done> "<title>" ["<detail>"]`
  - `node dev/cli.js note <status|completed|prediction> <issue|-> "<text>"`
  - `node dev/cli.js status` prints `renderGreeting` output without the board
  - `node dev/cli.js board-config <owner> <number>` stores both in `meta`
- Produces `dev/session-start.js`: prints `renderGreeting(getState, fetchBoard(...))` to stdout. Always exits 0. On any error prints `Dev notes unavailable: <message>`.

- [ ] **Step 1: Write the failing tests** (spawn with `child_process.spawnSync`, env `JSDND_DEV_DB` set to a temp path, cwd set to `os.tmpdir()` to prove cwd independence):
  - `cli task and note then status shows them`: after `task 3 in_progress "Setup"` and `note completed 3 "done X"`, `status` stdout contains `Setup` and `done X`.
  - `session-start on a fresh DB prints no tasks recorded and exits 0`.
  - `session-start exits 0 and prints Dev notes unavailable when the DB path is a directory`.
  - `session-start works from a different cwd`.
  - `cli rejects an unknown status with a non-zero exit`.
- [ ] **Step 2: Run** `node --test tests/dev/cli.test.js tests/dev/session-start.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `dev/cli.js` and `dev/session-start.js`. Board lookup reads `board_owner` and `board_number` from `meta`; if missing, board result is `{ ok: false, reason: 'board not configured' }`.
- [ ] **Step 4: Run** the same command. Expected: PASS (5 tests).
- [ ] **Step 5: Register the hook.** Create `.claude/settings.json` with a `SessionStart` command hook running `node "$CLAUDE_PROJECT_DIR/dev/session-start.js"`. The exact schema and the `CLAUDE_PROJECT_DIR` variable come from secondhand sources: confirm against current Claude Code hooks docs before finalizing.
- [ ] **Step 6: Write `CLAUDE.md`** containing: pointer to the spec; the working rules from spec section 7 (no git without ask, ask before outward-facing actions, no dashes, scripts over agents); **session start**: greet the owner with the state printed by the hook; **session end**: run `task` for the current task, then `note completed` if it is done (stating exactly that it was completed), then one or more `note prediction` entries for likely next steps, labeled as predictions.
- [ ] **Step 7: Verify manually.** Run `/hooks` in Claude Code to confirm registration, then start a new session and confirm the greeting arrives. Hook output has been reported as silently dropped in some cases, so if it does not show up, check `claude --debug` before changing code.
- [ ] **Step 8: Checkpoint.** Report changed files. No git.

---

### Task 5: Setup script skeleton

**Files:**
- Create: `setup.sh`, `tests/setup.test.js`

**Interfaces:**
- Produces: `setup.sh` exit 0 and prints `Setup complete` when Node exists and `require('node:sqlite')` loads. Exit 1 with a plain-words message naming what is missing otherwise.

- [ ] **Step 1: Write the failing tests:**
  - `setup.sh passes when node and node:sqlite work`: stdout contains `Setup complete`, exit 0.
  - `setup.sh fails with a clear message when node is missing`: spawn with `PATH` set to an empty temp dir plus `/bin`, exit 1, stderr contains `Node.js`.
- [ ] **Step 2: Run** `node --test tests/setup.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `setup.sh` (bash, `set -euo pipefail`): check `node`, probe `node -e "require('node:sqlite')"`, print results. No installing yet.
- [ ] **Step 4: Run** the same command. Expected: PASS (2 tests).
- [ ] **Step 5: Checkpoint.** Report changed files. Tell the owner that auto-installing Node is deliberately not done here; the method is an owner decision (see end of document).

---

### Task 6: GitHub board and backlog

**Files:**
- Create: `dev/github/seed.sh`, `dev/github/backlog.tsv`, `tests/github-seed.test.js`

**Interfaces:**
- Produces: `bash dev/github/seed.sh` prints the `gh` commands it would run (dry run, the default). `bash dev/github/seed.sh --apply` runs them.
- `backlog.tsv` columns: `title<TAB>labels<TAB>body`. Labels: `epic`, `task`, `plan-1` through `plan-7`.
- Backlog rows: one `epic` per Plan 2 to 7 titled after the table in the scope-check message (Game DB and script layer, Quest engine, World and hero generation, Combat, Stamina bar, Ending stats page), each body naming the spec sections it covers; and one `task` row per task in this plan.

- [ ] **Step 1: Write the failing test:** `seed.sh dry run prints one gh issue create per backlog row and never calls gh`. Run with a fake `gh` first on `PATH` that records calls, assert the record is empty after a dry run, and assert stdout line count equals row count plus the project and label commands.
- [ ] **Step 2: Run** `node --test tests/github-seed.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `seed.sh` and `backlog.tsv`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Show the dry-run output to the owner and wait for a yes.** This creates a GitHub project, labels, and issues on a public repo, so nothing is applied without an explicit go-ahead. The `gh` token already has the `project` scope.
- [ ] **Step 6: Apply** with `--apply` after the owner agrees. Create the board as `gh project create --owner yamnyk --title "JS D&D"`, link it to the repo, then run `node dev/cli.js board-config yamnyk <project number>`.
- [ ] **Step 7: Go back to Task 3 Step 1** if the fixture was not captured yet, and finish Task 3.
- [ ] **Step 8: Checkpoint.** Report changed files and the created issue numbers.

---

### Task 7: Plan-mode prompts

**Files:**
- Create: `docs/process/plan-mode-prompts.md`

**Interfaces:**
- Produces: seven prompts, one per plan, each following this exact template (fill the bracketed parts from the spec):

```
Read docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md in full.
Run `node dev/cli.js status` and read the current state first.
Plan only this subsystem: [SUBSYSTEM NAME], covering spec sections [SECTIONS].
Follow the spec's [My call] / [My guess] / [Unchecked] markers: do not treat guesses as decisions, and verify anything marked [Unchecked] before relying on it.
Constraints: no git commands unless I ask, ask before any outward-facing action, no em-dash or en-dash anywhere, deterministic work in scripts, game data only in SQLite through scripts.
Write the plan to docs/superpowers/plans/ using the writing-plans skill. Tell me anything the spec leaves open and ask before you assume it.
```

- [ ] **Step 1: Write the seven prompts** into `docs/process/plan-mode-prompts.md`, one heading per plan, template filled in. Subsystems and spec sections: Plan 1 (this plan, done): 6, 7, 8. Plan 2 Game DB and script layer: 6, 5.7 fight log, 5.8. Plan 3 Quest engine: 5.3, 5.5, 5.6. Plan 4 World and hero generation: 5.1, 5.2, 5.4. Plan 5 Combat: 5.7. Plan 6 Stamina bar: 5.9, 8. Plan 7 Ending stats page: 5.10.
- [ ] **Step 2: Check the file for dashes:** `grep -nP '[\x{2013}\x{2014}]' docs/process/plan-mode-prompts.md`. Expected: no output.
- [ ] **Step 3: Checkpoint.** Report changed files. No git.

---

## Left to the owner

- **How setup installs Node** when it is missing (Homebrew, apt, nvm, or just printing instructions). Task 5 only checks and explains.
- **Confirming the hook JSON shape** (Task 4 Step 5) against current Claude Code docs.
- **License and certificate** stay open from the spec and do not block this plan.

## Self-review notes

- Spec coverage: section 7 (tracking, dev DB, session start/end) maps to Tasks 1 to 4 and 6; section 6 install maps to Task 5; the seven-plan split and prompts map to Task 7. Sections 5.x gameplay is deliberately not in this plan; it belongs to Plans 2 to 7.
- Type consistency: `TaskStatus`, `Note`, `Task`, `State`, `BoardItem`, `BoardResult` are used with one meaning across Tasks 2 to 4.
