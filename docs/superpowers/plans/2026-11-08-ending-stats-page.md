# Ending Stats Page Implementation Plan (Plan 7 of 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A final boss in the world, and a hidden, script-built HTML stats page the player earns by solving every quest and beating the boss.

**Architecture:** A seventh NPC in the fixed skeleton is the final boss. Combat gates the boss fight behind all quests solved. A pure stats collector reads the game DB, a pure renderer turns the stats into one self-contained HTML file with inline SVG charts, and a hidden CLI command writes that file to `player/ending.html` once the ending is unlocked.

**Tech Stack:** Node.js (`node:sqlite`, `node:test`, `node:fs`), SQLite, plain HTML, CSS, and SVG with no libraries.

**Spec:** `docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md` (5.10, plus 5.2 for the skeleton and 5.7 for combat). Builds on Plans 2 to 6: `world/skeleton.js`, `game/world.js`, `game/combat-engine.js`, `game/quests.js`, `game/cli.js`.

## Global Constraints

- No em-dash (U+2014) or en-dash (U+2013) anywhere in the repo. Build them with `String.fromCharCode` in tests. The generated page may show player text as typed.
- Commit and push after each task with plain messages. Never a Co-Authored-By or Claude line. Never force-push without asking.
- Game state only in SQLite through scripts. Every connection uses `openGameDb`. Script output is one line of JSON; errors are JSON on stderr with exit 1; tamper exits 2. Each command accepts only its own options and rejects extra arguments.
- Zero npm dependencies. The page makes no network requests: no external fonts, scripts, or images.
- The page is "hidden" only in the sense of not advertised (spec 5.10): the command is absent from `USAGE`, the README, and the quick tour. `play.md` mentions it because the Master must reveal it.

## Decisions

Approved by the owner:
- **The ending needs both:** every quest in the repo solved in the current epoch AND the final boss beaten. The boss is a **new NPC** added to the skeleton.
- **Delivery:** a script reads the DB and writes one compiled HTML file. No server.
- **Hours spent:** estimated from existing timestamps, ignoring gaps over 30 minutes. No new table.
- **JS subjects learned:** skipped for now. The page shows the solved quests with their titles and rungs instead. Subjects can come back as a later plan.

Calls made while planning (the owner can reject any):
- The boss is `N7`, role `boss`, at `L6` (stronghold) next to the captain `N6`. `look` already lists every NPC at a location, so two NPCs there needs no new rule. The Master invents the boss's name, description, and voice like any other NPC.
- Fighting `N7` is refused until every quest is solved in the current epoch, and only at tier `tough`. Winning knocks the boss out like any NPC (Plan 5 rule), and the boss win is what unlocks the page.
- A boss win counts only if it happened after the latest tamper reset. A reset therefore locks the ending again, because quests restart and the boss must be beaten again.
- Existing saves with a 6 NPC world become incomplete (`world status` lists `npcs` as missing) and cannot be refilled once started. The game is unreleased and the local save has no world, so there is no migration.
- Hours spent: collect every timestamp the game already writes (dice rolls, honor events, quest attempts, solves and hints, fights and fight log steps, moves, resets). Sort them. Add every gap of 30 minutes or less. The result is shown rounded to whole minutes and labeled "estimated". A single event gives 0.
- Enemies defeated counts all won engine fights across every epoch (history is kept). Tasks solved shows the current epoch count out of the total. The complexity chart plots every solve over time (all epochs), so a fall is visible.
- Charts: honor over time (step line from `honor_events.honor_after`, resets marked) and cumulative complexity over time (from `quest_solves`). Both are inline SVG that works in light and dark.
- `ending build` writes `player/ending.html` (gitignored) and returns its path. It refuses with a plain message until the ending is unlocked. `fight attack` and `move check` outputs gain `endingUnlocked: true` when the boss win unlocks it, so the Master knows without an extra call.
- `ending build` is not on the collapse block list: it only reads the DB and writes one file.

## Review Focus

1. Escaping: a hero name, setting name, or honor note with `<script>`, quotes, `&`, or a closing `</svg>` cannot inject markup into the page; the page contains no `http` or `https` URLs and no `<script>` tag (Task 4).
2. Unlock states: quests done but no boss, boss gate before quests are done, boss won then a tamper reset, boss won before a reset then quests redone but boss not rebeaten, all give a locked answer; only all quests plus a post-reset boss win unlocks (Tasks 2 and 5).
3. Hours: no events, one event, equal timestamps, out-of-order input, a 31 minute gap, a gap of exactly 30 minutes, and junk timestamps never give NaN, negative, or absurd hours (Task 3).
4. Charts: empty, single-point, flat, and honor-at-floor-or-ceiling series render valid SVG with no NaN coordinates (Task 4).
5. A 6 NPC world reports `npcs` missing instead of crashing, and `world fill` with six NPCs is rejected with a message naming N7 (Task 1).

## Files

| Path | Responsibility |
|---|---|
| `world/skeleton.js` | Add `N7` boss at `L6` |
| `game/world.js`, `game/world-status.js`, `tests/game/world-fixtures.js` | Seven NPC slots, fixtures and counts |
| `game/combat-engine.js` | Boss gate (all quests solved, tier tough), boss win flag |
| `game/ending.js` | `endingStatus`, `buildEnding` |
| `game/ending-stats.js` | `activeSeconds`, `collectStats` |
| `game/ending-page.js` | `renderPage`, SVG line chart helper, HTML escaping |
| `game/cli.js` | Hidden `ending build`, `endingUnlocked` on fight outputs |
| `.claude/commands/play.md`, `README.md` | Master instructions (boss, ending), feature status |

## Task 1: The boss in the skeleton

**Files:**
- Modify: `world/skeleton.js`, `game/world.js`, `game/world-status.js` (only if it hardcodes a count), `tests/game/world-fixtures.js`, `.claude/commands/play.md`
- Test: `tests/world/skeleton.test.js`, `tests/game/world.test.js`, `tests/game/cli.test.js`, `tests/game/play-command.test.js`

**Interfaces:**
- Produces: `SKELETON.npcs` has `{ slot: 'N7', location: 'L6', role: 'boss' }`; `goodWorld()` includes N7; `worldStatus(...).npcsTotal` is 7.

- [ ] **Step 1: Write the failing tests.** The skeleton has 7 NPCs, N7 is the boss at L6 and has no quest, every NPC location exists, `look` at L6 lists both N6 and N7. `fillWorld` without N7 is rejected with an error naming N7. A world filled with 6 NPCs directly in the DB reports `npcs` in `worldStatus(...).missing` and `look` throws the not-ready error. `play.md` says the world has seven NPCs and mentions the boss.
- [ ] **Step 2: Run to see them fail.** Run: `node --test`. Expected: FAIL on the new tests and on fixtures that now miss N7.
- [ ] **Step 3: Add N7 to the skeleton, update the world fixtures and the `play.md` counts.** Fix any other test that counts NPCs.
- [ ] **Step 4: Run the full suite.** Expected: PASS.
- [ ] **Step 5: Commit and push.** `git commit -m "Add the final boss NPC to the world skeleton"`.

## Task 2: Boss gate and unlock status

**Files:**
- Create: `game/ending.js`
- Modify: `game/combat-engine.js`, `game/moves.js` (only to carry the flag)
- Test: `tests/game/ending.test.js`, `tests/game/combat-engine.test.js`

**Interfaces:**
- Consumes: `getProgress(db, saveId)` from `game/quests.js` (`solved`, `total`), `resets` table, `fights` rows.
- Produces: `endingStatus(db, saveId) -> { questsSolved, questsTotal, bossDefeated, unlocked }`; `beginFight` throws for `N7` unless all quests are solved (message names the quests left) or the tier is not `tough`; a won fight against `N7` adds `endingUnlocked: true` to the returned state when `endingStatus(...).unlocked`.

- [ ] **Step 1: Write the failing tests.** `endingStatus` for each state in Review Focus 2: fresh save, all quests solved with no boss win, boss win with quests unsolved (only possible by writing rows directly), both (unlocked), then a tamper reset (locked again), then quests solved again without a new boss win (locked), then a new boss win (unlocked). `beginFight` on `N7` refuses with quests unsolved, refuses tiers other than `tough`, and works when all quests are solved. Winning gives `endingUnlocked: true`; winning against any other NPC does not.
- [ ] **Step 2: Run to see them fail.** Expected: FAIL, module missing.
- [ ] **Step 3: Implement `endingStatus` and the gate.** The boss win test is: a `fights` row for the save with `npc_slot = 'N7'`, `outcome = 'won'`, and `ended_at` later than the save's latest `resets.created_at` (or any if there is none).
- [ ] **Step 4: Run to see them pass, then the full suite.**
- [ ] **Step 5: Commit and push.** `git commit -m "Gate the final boss and track the ending"`.

## Task 3: Stats collection

**Files:**
- Create: `game/ending-stats.js`
- Test: `tests/game/ending-stats.test.js`

**Interfaces:**
- Produces: `activeSeconds(timestampsMs, maxGapMs = 30 * 60 * 1000) -> number`; `collectStats(db, saveId) -> { hero: { name, race, heroClass, level }, setting: { name } | null, hoursEstimated, minutes, enemiesDefeated, fights, falls, tasks: { solved, total, list: [{ id, title, rung, complexity, solvedAt, hintsUsed, epoch }] }, honor: [{ at, honor, kind, reason }], complexity: [{ at, cumulative }] }`.

- [ ] **Step 1: Write the failing tests.** `activeSeconds` for Review Focus 3 (empty, one, equal, unsorted, exactly 30 minutes counted, 31 minutes not counted, `NaN` and negative entries ignored). `collectStats` on a built-up DB: counts wins only for engine fights, `falls` equals the resets count, the honor series is in time order and includes the reset drop, the cumulative complexity grows with each solve, an empty save gives zeros and empty lists, and the minutes come from the union of all the timestamp sources.
- [ ] **Step 2: Run to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement both.** Timestamps from the tables listed in Decisions; ISO strings parsed with `Date.parse`.
- [ ] **Step 4: Run to see them pass, then the full suite.**
- [ ] **Step 5: Commit and push.** `git commit -m "Collect the ending stats from the game DB"`.

## Task 4: The page

**Files:**
- Create: `game/ending-page.js`
- Test: `tests/game/ending-page.test.js`

**Interfaces:**
- Consumes: the `collectStats` shape.
- Produces: `renderPage(stats) -> string` (a full HTML document); `escapeHtml(text) -> string`; `lineChart(points, options) -> string` (an `<svg>` string).

- [ ] **Step 1: Write the failing tests.** Review Focus 1 and 4: hostile strings are escaped everywhere they appear; the output has no `<script`, no `http://` or `https://`, and no `NaN` or `Infinity`; empty, single-point, and flat series render valid SVG; honor at -100 and 100 stays inside the chart; the document has a `<title>`, a dark-mode media query, a viewport meta, and shows hero name, hours labeled estimated, enemies defeated, tasks solved as `n of m`, falls, and one row per solved quest.
- [ ] **Step 2: Run to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement the renderer.** CSS variables for light and dark, one column on a phone, charts as inline SVG with a text summary for screen readers.
- [ ] **Step 4: Run to see them pass, then the full suite.**
- [ ] **Step 5: Commit and push.** `git commit -m "Render the ending page as one self-contained HTML file"`.

## Task 5: The hidden command and the Master

**Files:**
- Modify: `game/ending.js`, `game/cli.js`, `.claude/commands/play.md`, `README.md`
- Test: `tests/game/ending.test.js`, `tests/game/cli.test.js`, `tests/game/play-command.test.js`

**Interfaces:**
- Consumes: `endingStatus`, `collectStats`, `renderPage`, `defaultPlayerDir()` from `game/quests.js`.
- Produces: `buildEnding(db, saveId, { playerDir, nowMs }) -> { file, minutes }` (throws a plain message when locked); CLI `ending build`.

- [ ] **Step 1: Write the failing tests.** `buildEnding` writes `ending.html` into the player dir only when unlocked and throws otherwise without writing. CLI: `ending build` exits 1 with a plain message when locked, exits 0 and returns `file` when unlocked, rejects extra arguments, is absent from the usage text, and still works during a stamina collapse. `fight attack` returns `endingUnlocked: true` on the boss win through the CLI. `play.md` has an Ending section (boss rules, run `ending build` after the boss falls, tell the player the file path and what it shows, never before) and the README lists the boss and the ending rows without naming the command.
- [ ] **Step 2: Run to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** Wire the command, keep it out of `USAGE`, and write the `play.md` and README text.
- [ ] **Step 4: Run to see them pass, run the dash scan** (`grep -rnP '[\x{2013}\x{2014}]' game quests tests .claude README.md docs` prints nothing) **and the full suite.**
- [ ] **Step 5: Commit and push.** `git commit -m "Add the hidden ending page and teach the Master the boss"`.

## Open items

- [My call] The boss lives at L6 with the captain and is always `tough`.
- [My call] Old 6 NPC worlds are not migrated.
- Subjects learned: skipped by the owner. The page lists solved quest titles and rungs instead.
- Opening the file in a browser is up to the player. The Master gives the path only.
- A live play-through from the first hero to the ending page has not happened yet; do it once all seven plans are built.
