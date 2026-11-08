# Stamina Bar Implementation Plan (Plan 6 of 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The hero's stamina is the player's real 5 hour Claude usage window, shown in a project-only bottom bar, stored in the game DB by the bar itself, and turned into tiredness penalties in combat and a collapse that blocks play near the end of the window.

**Architecture:** A zero-dependency status line script (`game/statusline.js`) is run by Claude Code, reads `rate_limits.five_hour` from its stdin JSON, upserts one stamina row in the game DB, and prints the bar. Pure math in `game/stamina.js` maps a percent to a tiredness band. The CLI reads the stored stamina, passes the band's modifiers into the Plan 5 combat engine, adds a `stamina show` command, and refuses play actions during a collapse.

**Tech Stack:** Node.js (`node:sqlite`, `node:test`), SQLite, Claude Code `statusLine` setting.

**Spec:** `docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md` (5.9, research item in 8). Builds on Plans 2 to 5: `game/db.js`, `game/combat.js` (`heroStats(hero, modifiers)`), `game/combat-engine.js`, `game/cli.js`, `.claude/settings.json`.

## Global Constraints

- No em-dash (U+2014) or en-dash (U+2013) anywhere. Build them with `String.fromCharCode` in tests.
- Commit and push after each task with plain messages. Never a Co-Authored-By or Claude line. Never force-push without asking.
- Game state only in SQLite through scripts. Every connection uses `openGameDb`. Script output is one line of JSON; errors are JSON on stderr with exit 1; tamper exits 2. Each command accepts only its own options and rejects extra arguments.
- The bar is project-only: it lives in this repo's `.claude/settings.json`, never in user settings.
- The status line script must never throw, hang, or print more than one line. It runs often.

## Decisions

Approved by the owner:
- **Data path:** the status line script writes each reading into the game DB. Combat and the Master read the latest row.
- **No usable reading:** fall back to an estimate from game time. The bar marks it as an estimate.
- **Penalties:** none before 60% used. From 60% they are noticeable and grow in steps.
- **Collapse:** near the end of the window the script refuses new play actions until the window resets, and the Master tells the collapse line with the hours left.

Calls made while planning (the owner can reject any):
- Source of truth is `rate_limits.five_hour.used_percentage` (0 to 100) and `resets_at` (epoch seconds), per the official status line docs. Both can be absent: the field exists only for Pro, Max, and Ultra subscribers, only after the first API response in a session, and each window can be missing alone.
- Stored as one row per save in table `stamina` (migration 9): `used_percent`, `resets_at`, `read_at`, `window_started_at`. No history; the ending page does not need it.
- A stored reading is fresh for 15 minutes and only while `resets_at` is in the future. Otherwise the estimate is used. The bar script sets `refreshInterval` to 60 seconds so an idle session keeps the reading fresh.
- Estimate: a window starts at the first game command after the previous window ended and lasts 5 hours. `used_percent = elapsed / 5h * 100`. Every CLI command touches `window_started_at` (starts a new window if the last one is over).
- Bands (used percent): under 60 none (attack 0, AC 0); 60 to 79 minus 1; 80 to 94 minus 2; 95 to 97 minus 3. Collapse from 98 up. The table lives in one place (`game/stamina.js`) so the owner can tune it.
- Physical tiredness is the attack and AC modifier from the band. Mental tiredness has no mechanic yet because the game has no INT checks: `stamina show` returns `mental: true` from 60% so the Master narrates slower thinking and may be shorter with hints. This is a call, not a spec decision.
- Blocked during collapse: `go`, `talk`, `roll`, `npc warn`, `fight begin|attack|flee`, `move propose|check`, `quest start|check|judge|hint`, `link use`. Allowed: every read-only command, `honor show`, `stamina show`, `look`, `integrity check`, `init`, `rules`, `voice lint`, `world *`, `hero show`. An open fight stays open and resumes after the reset.
- The collapse text is the spec's line: "you're completely tired. you fell on the spot where you were standing at LOCATION for HOURS". The script returns `location` (name) and `hours` (rounded up, from `resets_at` or the estimate); the Master voices it in the world's tone.
- A tamper reset does not touch stamina.
- Bar shows stamina left (100 minus used), for example `STAMINA [######----] 62% left | resets in 2h13m`, with `~` and `est.` when estimated. If there is no save at all it still shows the bar from the payload and writes nothing.

## Review Focus

1. Boundaries: 59.9, 60, 79.9, 80, 94.9, 95, 97.9, 98, and 100 percent map to the right band; bad input (NaN, negative, over 100, strings) never gives a penalty or a crash (Task 1).
2. Stale and missing readings: older than 15 minutes, `resets_at` in the past, or no `rate_limits` at all falls back to the estimate and never to "full strength forever" or to a collapse from old data (Task 2).
3. The status line script never throws, handles empty stdin, junk JSON, a missing DB, a locked DB, and a payload with only `seven_day`, and prints exactly one line (Task 5).
4. Collapse blocks every play command in the list and none of the read-only ones, keeps an open fight open, and unblocks once the window resets (Task 4).
5. Modifiers change attack and AC only in the engine and are never applied to the enemy; a fight started tired stays tired for the whole call, not for stored state (Task 3).

## Files

| Path | Responsibility |
|---|---|
| `game/stamina.js` | Pure: `parsePayload`, `bandFor`, `renderBar`, thresholds. Store: `recordReading`, `touchWindow`, `currentStamina` |
| `game/schema.js` | Migration 9: `stamina` table |
| `game/combat-engine.js`, `game/combat.js` | Thread `modifiers` through `beginFight`, `heroAttack`, `loseHeroTurn`, and the enemy turn |
| `game/cli.js` | `stamina show`, activity touch, tiredness into fight commands, collapse gate, `stamina` field on `look` |
| `game/statusline.js` | Status line entry: stdin JSON in, DB write, one line out |
| `.claude/settings.json` | Project `statusLine` entry |
| `.claude/commands/play.md`, `README.md` | Master instructions and feature status |

## Task 1: Stamina math

**Files:**
- Create: `game/stamina.js`
- Test: `tests/game/stamina.test.js`

**Interfaces:**
- Produces: `parsePayload(payload) -> { usedPercent, resetsAt } | null`; `bandFor(usedPercent) -> { band: 'fresh'|'tired'|'weary'|'spent'|'collapsed', attack, ac, mental, collapsed }`; `renderBar({ usedPercent, resetsAt, estimated }, nowMs, width = 10) -> string`; constants `COLLAPSE_AT = 98`, `WINDOW_MS = 5 * 60 * 60 * 1000`.

- [ ] **Step 1: Write the failing tests.** `bandFor` at every boundary in Review Focus 1 (60 gives attack -1, 59.9 gives 0; 80 gives -2; 95 gives -3; 98 gives `collapsed: true`), `mental` true from 60, bad input (`NaN`, `-5`, `130`, `'60'`) treated as clamped or rejected without throwing (rule: numeric strings and out of range are clamped to 0 to 100, non-numbers give `fresh`). `parsePayload` accepts the official payload shape, returns null when `rate_limits` or `five_hour` is missing, when `used_percentage` is not a finite number, or when only `seven_day` is present. `renderBar` shows stamina left, a `~` and `est.` when `estimated`, no em-dash or en-dash, and never exceeds one line.
- [ ] **Step 2: Run to see them fail.** Run: `node --test tests/game/stamina.test.js`. Expected: FAIL, module missing.
- [ ] **Step 3: Implement `game/stamina.js` pure part.** One band table, `bandFor` reads it.
- [ ] **Step 4: Run to see them pass.** Expected: PASS, then `node --test` stays green.
- [ ] **Step 5: Commit and push.** `git commit -m "Add stamina bands and bar rendering"`.

## Task 2: Stamina store and current reading

**Files:**
- Modify: `game/schema.js` (migration 9), `game/stamina.js`
- Test: `tests/game/stamina-store.test.js`

**Interfaces:**
- Consumes: `bandFor`, `WINDOW_MS`.
- Produces: `recordReading(db, saveId, { usedPercent, resetsAt }, nowMs)`; `touchWindow(db, saveId, nowMs)`; `currentStamina(db, saveId, nowMs) -> { usedPercent, resetsAt, estimated, ...bandFor(usedPercent), hours }` where `hours` is whole hours until reset, rounded up, at least 1.

- [ ] **Step 1: Write the failing tests.** Fresh reading is used as is (`estimated: false`). A reading 16 minutes old falls back to the estimate. A reading whose `resets_at` passed falls back to the estimate. No row at all gives the estimate from `touchWindow`. `touchWindow` starts a window on the first call, keeps `window_started_at` for 5 hours, and starts a new one after. Estimate at 2h30m into a window is 50. One row per save, a second save is independent, a reading never changes `window_started_at`. A fresh reading at 99 percent gives `collapsed` and `hours` from `resets_at`. Migration 9 applies on top of a populated version 8 DB.
- [ ] **Step 2: Run to see them fail.** Expected: FAIL.
- [ ] **Step 3: Add migration 9 (`stamina` table, primary key `save_id`) and implement the three functions.** Upsert in a transaction.
- [ ] **Step 4: Run to see them pass, then the full suite.**
- [ ] **Step 5: Commit and push.** `git commit -m "Store stamina readings and estimate when none is fresh"`.

## Task 3: Tiredness in combat

**Files:**
- Modify: `game/combat-engine.js` (`beginFight`, `heroAttack`, `loseHeroTurn`, `enemyTurn`, `enemyResponds`), possibly `game/combat.js`
- Test: `tests/game/combat-engine.test.js`

**Interfaces:**
- Consumes: `heroStats(hero, modifiers)` already takes `{ attack, ac }`.
- Produces: each of the four engine functions takes an optional `modifiers = {}` in its options object and passes it to every `heroStats` call; `checkMove` in `game/moves.js` passes it through to `heroAttack` and `loseHeroTurn`.

- [ ] **Step 1: Write the failing tests.** With `{ attack: -2 }` a hero roll that hits by exactly 2 now misses. With `{ ac: -3 }` an enemy roll that missed by exactly 3 now hits. Modifiers never change the enemy's attack or HP. A natural 20 still hits and a natural 1 still misses. No modifiers keeps every existing test unchanged.
- [ ] **Step 2: Run to see them fail.** Expected: FAIL.
- [ ] **Step 3: Thread `modifiers` through the five functions and `checkMove`.**
- [ ] **Step 4: Run to see them pass, then the full suite.**
- [ ] **Step 5: Commit and push.** `git commit -m "Pass tiredness modifiers through the fight engine"`.

## Task 4: CLI: stamina show, tired fights, collapse gate

**Files:**
- Modify: `game/cli.js`
- Test: `tests/game/cli.test.js`

**Interfaces:**
- Consumes: `currentStamina`, `touchWindow`, `bandFor`, combat engine options from Task 3.
- Produces: `stamina show` (one JSON line with `usedPercent`, `left`, `band`, `attack`, `ac`, `mental`, `collapsed`, `estimated`, `hours`); `look` output gains `stamina: { band, collapsed }`; fight and move commands pass `{ attack, ac }` from the current band; a collapsed hero gets a stderr JSON error with `collapsed: true`, `location`, `hours`, exit 1, for every command in the blocked list in Decisions.

- [ ] **Step 1: Write the failing tests.** `stamina show` rejects extra arguments. A reading of 85 percent makes `fight attack` use attack -2 and AC -2 (use a seeded situation where the roll flips). Every blocked command exits 1 with `collapsed: true` and the location name at 98 percent, and every allowed one still works. An open fight stays open through a collapse and resumes after `resets_at` passes. A command touches the estimate window. The tamper gate still wins over the collapse gate (exit 2).
- [ ] **Step 2: Run to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** Compute the current stamina once per command after the dice gate and before dispatch.
- [ ] **Step 4: Run to see them pass, then the full suite.**
- [ ] **Step 5: Commit and push.** `git commit -m "Add stamina show, tired combat, and the collapse gate"`.

## Task 5: Status line script and project setting

**Files:**
- Create: `game/statusline.js`
- Modify: `.claude/settings.json`
- Test: `tests/game/statusline.test.js`

**Interfaces:**
- Consumes: `parsePayload`, `recordReading`, `currentStamina`, `renderBar`, `openGameDb`.
- Produces: a process that reads stdin JSON, writes the reading when the payload has one and a save exists, and prints exactly one line.

- [ ] **Step 1: Write the failing tests** (spawn the script with `JSDND_GAME_DB` pointing at a temp DB). A good payload writes the row and prints the bar. Empty stdin, junk JSON, a payload with only `seven_day`, and a locked DB all print one line and exit 0. No save in the DB prints the bar and writes nothing. Output never contains an em-dash or en-dash. Runs in under 1 second. `.claude/settings.json` has a `statusLine` with `type: "command"`, a command pointing at `game/statusline.js` through `$CLAUDE_PROJECT_DIR`, `refreshInterval: 60`, and still has the SessionStart hook.
- [ ] **Step 2: Run to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement `game/statusline.js` and the settings entry.** Wrap everything in try/catch with a plain fallback line.
- [ ] **Step 4: Run to see them pass, then the full suite.**
- [ ] **Step 5: Live check with the owner (Unchecked items).** In a fresh Claude Code session in this repo confirm: the bar appears, a real `rate_limits.five_hour` reading lands in the DB (`node game/cli.js stamina show` shows `estimated: false`), and a project `statusLine` replaces the owner's user-level one. Record what is found in the dev notes; if the real field names differ, fix `parsePayload` test-first.
- [ ] **Step 6: Commit and push.** `git commit -m "Add the stamina status line for this project"`.

## Task 6: Master instructions and README

**Files:**
- Modify: `.claude/commands/play.md`, `README.md`
- Test: `tests/game/play-command.test.js`

- [ ] **Step 1: Write the failing tests.** `play.md` has a Stamina section that names `node game/cli.js stamina show`, tells the Master to narrate tiredness after 60% and slower thinking when `mental` is true, and to tell the collapse line with the location and hours from the error and to stop offering actions until it ends. README marks the stamina rows Done or In progress honestly.
- [ ] **Step 2: Run to see them fail.** Expected: FAIL.
- [ ] **Step 3: Write the Stamina section and update the README rows** (stamina bar, tiredness penalties; note the live check status).
- [ ] **Step 4: Run to see them pass, run the dash scan** (`grep -rnP '[\x{2013}\x{2014}]' game tests .claude README.md docs` prints nothing) **and the full suite.**
- [ ] **Step 5: Commit and push.** `git commit -m "Teach the Master about stamina"`.

## Open items

- [Unchecked] A project `statusLine` replaces a user-level one. The docs page does not say. Checked live in Task 5.
- [Unchecked] The payload has `rate_limits.five_hour` for this account. Checked live in Task 5.
- [My guess] 15 minute freshness, 60 second refresh, estimate window rule, collapse at 98, and the penalty steps. All are constants in one place.
- Mental tiredness stays narrative until the game has INT checks.
