# Fix the Deferred Review Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the deferred review findings that matter, close the cheap test gaps, build the three owner decisions (race bonuses kept on reset, a wider fingerprint, revoking a solve), and restructure the README.

**Architecture:** Mostly small, local changes: reads move inside existing transactions, a few rule checks are added to existing functions, the seal file learns to hold two hashes, and one new command (`quest revoke`) plus one migration. No new subsystem.

**Tech Stack:** Node.js (`node:sqlite`, `node:test`, `node:child_process`), SQLite, Prettier and ESLint (dev dependencies already in place).

**Spec:** `docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md`. Register: `docs/process/deferred-findings.md` (item ids A1 to F2 and G1 to G4 below refer to it). Approved plan: `/Users/yamnyk/.claude/plans/smooth-mixing-lake.md`.

## Global Constraints

- Commit and push after each task with plain messages. Never a Co-Authored-By or Claude line. Never force-push or rewrite pushed history without asking.
- No em-dash (U+2014) and no en-dash (U+2013) anywhere. Build them with `String.fromCharCode` in tests.
- Game state only in SQLite through scripts. Every connection uses `openGameDb`. Script output is one line of JSON, errors are JSON on stderr with exit 1, tamper exits 2. Each command accepts only its own options and rejects extra arguments.
- Zero npm runtime dependencies. `npm run lint` and `npm run format:check` stay green after every task.
- Machine-readable names do not change: CLI commands, JSON keys, DB column names, honor kinds, quest ids. Additions are allowed (`quest revoke`, new JSON fields, new columns).
- Migrations are append-only. Never edit an applied one.
- Every fix starts with a test that fails for the stated reason. Name the production change that would make the test fail before writing it. A fix without a failing test first does not count.
- The multi-language plan is approved but not built. New player-facing or Master-facing messages are English now, written so they can be keyed later (one message per code, params separate from text).
- `game/dice.js` is never edited or formatted. `game/rolls.js` joins it as sealed in Task 3, and only that task changes how sealing works.

## Decisions

Owner decisions:
- Order: before the multi-language plan and the 51-quest curriculum.
- Scope: the 9 Important items (A3, A7, A8, B1, B5, B7, C7, D1, E1) plus 11 cheap test gaps (A1, A2, A6, E2 to E9). The other 23 Minors stay in the register as accepted.
- A7: read inside the transaction. E1: scripted rng through the library, no seed hook in the CLI.
- G1: a reset keeps race bonuses. G2: keep (a legal doc counts as a hint). G3: unsandboxed stays. G4: the fingerprint covers `dice.js` and `rolls.js`. B10: a late cheated verdict revokes a judged solve.
- B7: quest commands require a hero, a finished world, and the earlier quests solved this epoch. NPC awake and location are not checked.
- B1: a quest fight is legitimate for any quest not solved this epoch.
- B5: the ending needs the boss win later than the latest quest solve in the current epoch.
- README: description, then How to play, then tech stack, then everything developer related. The Ukrainian README has no developer content. Language options cannot be GitHub tabs, so a language switcher line opens both READMEs.

Calls made while planning (Gogi can reject any):
- D1: the child answers a never-settling promise through a `beforeExit` handler with an error result `never-settled`.
- A8: `proposeMove` is one unit; an existing `move-<id>.js` is renamed to `move-<id>.old.js`.
- B10: new command `quest revoke <id> "<note>"`, column `quest_solves.revoked_at` (migration 11), honor rule `cheat` applied once, revoked solves excluded from progress and the ending, knockout wake counting unchanged.
- G4: the seal file holds one hash per sealed file. `game/rolls.js` joins the Prettier and ESLint ignores and `.gitattributes` (LF) like `dice.js`.
- G1: reset keeps `trait_adjust` (race bonuses) and sets `base` to 8.
- The five flaky tests keep their CLI assertions. Only their fight setup moves to the library.

## Review Focus

1. Two processes writing at once: first-open migrate, fight begin, move check, fight attack (Task 1).
2. A crash in the middle of a multi-row write: reset, judge, hint, move proposal (Task 1).
3. A tamper reset in the middle of a quest or a fight, and the fingerprint covering `rolls.js` (Task 3).
4. A quest added after the ending was unlocked (Task 2) and a revoked solve (Task 3).
5. The file path the player is told to edit, with `JSDND_PLAYER_DIR` set (Task 2).
6. A player function that never finishes, for quests and for moves (Task 4).
7. README section order, the language switcher links, and no developer content in the Ukrainian README (Task 6).

## Files

| Path | Responsibility |
|---|---|
| `game/db.js` | A3: re-read applied migrations under the lock |
| `game/combat-engine.js`, `game/moves.js`, `game/fights.js` | A7, A8, B1 |
| `game/quests.js`, `game/quest-runner.js`, `quests/*.js` | B7, C7, B10, progress |
| `game/ending.js` | B5 |
| `game/reset.js`, `game/hero.js`, `game/integrity.js`, `game/seal.js` | G1, G4 |
| `game/schema.js` | Migration 11 |
| `quests/run-check.js`, `quests/run-tests.js` | D1 |
| `game/cli.js` | `quest revoke`, new refusals, path output |
| `.prettierignore`, `eslint.config.js`, `.gitattributes` | `game/rolls.js` sealed |
| `README.md`, `docs/process/deferred-findings.md`, `docs/superpowers/plans/2026-11-08-multi-language.md` | Task 6 |
| `.claude/commands/play.md` | `quest revoke`, quest gating notes |
| `tests/**` | Every task |

## Task 1: Atomicity and the database

**Files:**
- Modify: `game/db.js`, `game/combat-engine.js`, `game/moves.js`, `game/quests.js` (only if A6 needs a fix)
- Test: `tests/game/db.test.js`, `tests/game/combat-engine.test.js`, `tests/game/moves.test.js`, `tests/game/integrity.test.js`, `tests/game/fights.test.js`, `tests/game/quests.test.js`, `tests/game/parallel.test.js` (new)

**Interfaces:**
- Consumes: `inTransaction(db, fn)`.
- Produces: `migrate(db)` re-reads `schema_migrations` after `BEGIN IMMEDIATE` for each migration. `beginFight`, `heroAttack`, `loseHeroTurn`, `fleeFight`, `checkMove`, and `proposeMove` read the open fight and the move row inside `inTransaction` and use only those fresh values. `proposeMove` inserts the row and writes the stub in one unit, and an existing stub is renamed to `move-<id>.old.js`.

- [ ] **Step 1: Write the failing tests.**
  - A3: two real child processes run `openGameDb` on the same new path at once, both exit 0 and the DB has each migration once.
  - A7 (`parallel.test.js`, real processes on one DB with a library-made fight): two simultaneous `fight begin` leave exactly one open fight and one fails with a clear error; two simultaneous `move check` of the same move apply exactly one sure hit and one fails "already checked"; two simultaneous `fight attack` leave the enemy HP equal to the max minus the sum of the logged damage and `round` advanced once per successful call.
  - A8: with a failing stub write (a directory where the file should go) no `fight_moves` row remains; an existing `move-<id>.js` is kept as `move-<id>.old.js` with its content.
  - A1: with a temporary trigger that aborts an `UPDATE` on `heroes`, `applyTamperReset` throws and the reset row, the honor event, the abandoned fights, and the ability changes are all rolled back.
  - A2: `logFightStep` seq restarts at 1 for a second fight and each fight's seq is gapless.
  - A6: with a temporary trigger that aborts late, `judgeQuest` and `logHint` leave no judgment, solve, hint, or honor row.
- [ ] **Step 2: Run to see them fail.** Run: `node --test`. Expected: the A3, A7, and A8 tests FAIL, A1, A2, and A6 either pass already (they are pins) or fail only if the code is wrong. A pin that passes is checked by one mutation (remove `inTransaction`) and that mutation must fail it.
- [ ] **Step 3: Implement** the reads inside transactions, the migrate re-check, and `proposeMove` as one unit.
- [ ] **Step 4: Run the full suite, lint, and format check.** Expected: PASS.
- [ ] **Step 5: Commit and push.** `git commit -m "Close the concurrency gaps: migrate race, in-transaction reads, atomic move proposal"`.

## Task 2: Game rules

**Files:**
- Modify: `game/combat-engine.js`, `game/ending.js`, `game/quests.js`, `game/cli.js`, `quests/dice-roll.js`, `quests/string-shout.js`, `quests/array-sum.js`, `quests/index.js`
- Test: `tests/game/combat-engine.test.js`, `tests/game/ending.test.js`, `tests/game/quests.test.js`, `tests/game/cli.test.js`

**Interfaces:**
- Produces: `beginFight(..., { questId })` requires a real quest not solved this epoch (error names the quest). `endingStatus` returns `bossDefeated` only when the boss win is later than the latest non-revoked solve in the current epoch. `startQuest`, `checkQuest`, and `judgeQuest` throw plain errors when there is no hero, the world is not complete, or an earlier quest is unsolved this epoch. `quest start`, `quest check`, and `quest list` return `file` as the real path (`join(playerDir, id + '.js')`) and the static `file` field on the quest modules is removed.

- [ ] **Step 1: Write the failing tests.** B1: `--quest` with an unknown quest, with a solved quest (this epoch), and with a solved quest in an earlier epoch (allowed again). B7: each refusal (no hero, incomplete world, earlier quest unsolved) for start, check, and judge, and the allowed path in order. C7: with `JSDND_PLAYER_DIR` set, `quest start`, `check`, and `list` all print that directory's path. B5: all quests solved, boss beaten, then a new fixture quest solved afterwards keeps `unlocked` false, and the next boss win unlocks and returns `endingUnlocked`. Existing tests that call quests out of order keep passing by setting up the earlier solves through a helper.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.** A shared helper `requireQuestAccess(db, saveId, quest)` in `game/quests.js`.
- [ ] **Step 4: Run the full suite, lint, and format check.**
- [ ] **Step 5: Commit and push.** `git commit -m "Gate quests and quest fights, tighten the ending, print the real quest path"`.

## Task 3: Owner calls built

**Files:**
- Create: nothing new beyond tests
- Modify: `game/reset.js`, `game/integrity.js`, `game/seal.js`, `game/schema.js` (migration 11), `game/quests.js`, `game/cli.js`, `.claude/commands/play.md`, `.prettierignore`, `eslint.config.js`, `.gitattributes`, `game/dice.sha256` (resealed)
- Test: `tests/game/integrity.test.js`, `tests/game/quests.test.js`, `tests/game/cli.test.js`, `tests/game/ending.test.js`, `tests/style.test.js`

**Interfaces:**
- Produces:
  - G1: `applyTamperReset` sets `base = 8` and leaves `trait_adjust` unchanged.
  - G4: `sealFiles(paths, sealPath)` and `checkSealed(paths, sealPath) -> { ok, reason, expected, found }` hash `game/dice.js` and `game/rolls.js`. A change in either, or a missing file or seal line, is tamper. The reset keys on the combined fingerprint, one reset per distinct fingerprint.
  - B10: migration 11 `ALTER TABLE quest_solves ADD COLUMN revoked_at TEXT`. `revokeSolve(db, saveId, questId, note)` and CLI `quest revoke <id> "<note>"`. Progress, the ending, and the knockout-free solve counts treat a revoked solve as unsolved for progress but the wake count still counts the row.

- [ ] **Step 1: Write the failing tests.**
  - G1: a dwarf keeps CON +2 after a reset, a custom race keeps its bonuses, level is 1, honor at the floor, bases 8.
  - G4: editing `rolls.js` resets, editing `dice.js` resets, removing a seal line is broken, one reset per distinct combined fingerprint, tamper still exits 2 before the collapse gate, `game/seal.js` seals both (use temp copies through the existing path overrides, never the real files), the real seal matches the real files, and `tests/style.test.js` asserts `game/rolls.js` is in `.prettierignore` and the ESLint ignores.
  - B10: revoke applies `cheat` once, a second revoke is refused, a revoke of an unsolved quest is refused, progress drops the quest, the ending locks until it is solved again, an earlier solve revoked in epoch 0 does not touch epoch 1, the command is blocked during a collapse, and the knockout wake count is unchanged.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.** Reseal both files with `node game/seal.js` in the same commit. Update `play.md` with `quest revoke` (the Master uses it when it finds cheating after a solve) and the usage text.
- [ ] **Step 4: Run the full suite, lint, and format check.** `game/dice.js` hash is unchanged. Only the seal file changes.
- [ ] **Step 5: Commit and push.** `git commit -m "Keep race bonuses on reset, seal rolls.js too, and add quest revoke"`.

## Task 4: Robustness (never-settling promises)

**Files:**
- Modify: `quests/run-check.js`, `quests/run-tests.js`, `game/child-check.js`
- Test: `tests/game/quest-runner.test.js`, `tests/game/move-runner.test.js`

**Interfaces:**
- Produces: while the child awaits player code it registers `process.once('beforeExit', ...)` that emits `{ status: 'error', code: 'never-settled', message }` through the existing result line path. The parent keeps the token and clip rules.

- [ ] **Step 1: Write the failing tests.** A quest check and a move check where the player function returns `new Promise(() => {})` give `status: 'error'` with a message that names the problem (not "stopped the program before the check could finish"). A real infinite loop still gives `timeout`. A function that resolves late still passes. The handler is removed after the result so it cannot emit twice.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** in both child entries, sharing the helper if it fits in `game/child-check.js`'s sibling.
- [ ] **Step 4: Run the full suite, lint, and format check.**
- [ ] **Step 5: Commit and push.** `git commit -m "Report a never-settling promise clearly instead of a silent exit"`.

## Task 5: Test gaps and flakiness

**Files:**
- Modify: `tests/game/cli.test.js` and the test files named below. Production code only if a pin exposes a real bug.
- Test: as listed.

- [ ] **Step 1: Write or change the tests.**
  - E1: the five CLI tests that start a tough fight with real dice (`fight flee`, the advanced move, the tired attack, the tired `fight begin` loop, the legacy fight end) create the fight through the library with a scripted rng, then drive the CLI. Ten consecutive runs of `node --test tests/game/cli.test.js` must all pass.
  - E2: hours stats pin every timestamp source and a second save.
  - E3: a reset in the same millisecond as a boss win locks the ending (`ended_at > reset` must stay strict).
  - E4: page tests for attribute quoting (a label with `"`), mark `<title>` escaping, the 300-dot cap, and the y clamp.
  - E5: dice edge inputs (`D20`, trailing space, `007d06`) pinned to their current behavior.
  - E6: link suffix matching (`x.mozilla.org.evil.test`, `mozilla.org.evil.test`) is not legal.
  - E7: the forge test pins that the token is not in the child's argv or readable from stdin after the child starts, plus one test per generated-input property of `dice-roll`.
  - E8: a `heroAttack` rollback test (throwing rng) and the tamper gate across all seven combat commands.
  - E9: the play.md drift guard also extracts every `--flag` it mentions and checks it against `ALLOWED_FLAGS`.
- [ ] **Step 2: Run them.** Each new pin is checked with the mutation named in the register (remove the guarded code, the test must fail), then restored.
- [ ] **Step 3: Fix any real bug a pin exposes** with its own failing test first.
- [ ] **Step 4: Run the full suite, lint, and format check.**
- [ ] **Step 5: Commit and push.** `git commit -m "Pin the review gaps and remove the real-dice flakiness from the CLI tests"`.

## Task 6: README and register

**Files:**
- Modify: `README.md`, `docs/process/deferred-findings.md`, `docs/superpowers/plans/2026-11-08-multi-language.md`
- Test: `tests/readme.test.js` (new), `tests/license.test.js`, `tests/game/play-command.test.js`

**Interfaces:**
- Produces: `README.md` order is: a language switcher line (`English | Українська`, the second linking to `README.uk.md`), title and general description, `## How to play`, `## Tech stack`, then the developer part (status, feature list, try the scripts, repo layout, how it gets built, contributing, license). "How to play" holds requirements, `bash setup.sh`, `/play` in Claude Code, what a session looks like, the stamina bar and honor in one paragraph each, and the "never edit `game/dice.js`" note. The combat example uses `npc warn`, `fight begin`, and `fight attack` instead of `fight start`.

- [ ] **Step 1: Write the failing tests.** Section order by heading index (description before How to play before Tech stack before the feature list and repo layout, license last), the first line is the switcher with a link to `README.uk.md`, no `fight start` in the README, the existing README tests (license section, throwaway save text, stamina and ending rows) still pass.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Restructure the README** (no content invented: move and tighten what exists, write only the short "How to play"). Update the register statuses for everything this plan fixed and mark F2 fixed. Edit Task 8 of the multi-language plan so `README.uk.md` starts with the same switcher linking back to `README.md`, and follows the order: description, how to play, requirements and setup, license, link to the English README, and no developer content.
- [ ] **Step 4: Run the full suite, lint, format check, and the dash scan** (`grep -rnP '[\x{2013}\x{2014}]' game quests tests dev .claude docs README.md CLAUDE.md setup.sh` prints nothing).
- [ ] **Step 5: Commit and push.** `git commit -m "Restructure the README for players first and refresh the findings register"`.

## Open items

- A final whole-branch review by a fresh reviewer after Task 6, as with the earlier plans.
- Not in this plan, still in the register as accepted: A4, A5, A9, B2 to B4, B6, B8, B9, B11, B12, C1 to C6, D2 to D6, and F1's wording beyond the README sample.
- The multi-language plan is next, then the curriculum.
