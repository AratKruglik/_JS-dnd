# Deferred review findings

Every Minor that a final review found and a plan deferred, kept here because the build ledgers live in a temporary folder. Each line says where it came from. Nothing here has been fixed unless the status says so. Status was checked against the code on 2026-11-08, and anyone planning from this list should re-check each line before acting on it.

Legend for status: **open** means still true in the code, **fixed** means a later change closed it, **owner call** means it is a decision for Gogi and not a bug, **covered** means another plan absorbs it.

## A. Atomicity, concurrency, and the database

| Id | Finding | Source | Status |
|---|---|---|---|
| A1 | Reset atomicity is not pinned by a mid-write failure test | Plan 2 | **fixed** (pinned: a failure mid-reset rolls everything back) |
| A2 | Per-fight `seq` is not pinned across two fights | Plan 2 | **fixed** (pinned: seq restarts per fight) |
| A3 | First-open migrate race on a fresh DB (two scripts starting together) | Plan 2 | **fixed** (migrate re-checks under the lock, tested with two processes) |
| A4 | Unconditional `ROLLBACK` can mask the original error, and nested blocks have no `SAVEPOINT` | Plan 2 | open |
| A5 | The tamper path crashes with exit 1 if the DB cannot be opened | Plan 2 | open |
| A6 | `judgeQuest` and `logHint` atomicity is not pinned | Plan 3 | **fixed** (pinned: judge and hint roll back fully) |
| A7 | Fight and move state is read before the transaction opens, so two parallel Bash calls can double-apply (two `move check` give two sure hits, two `fight attack` lose a damage update, two `fight begin` leave two open fights) | Plan 5 | **fixed** (state reads moved inside the transaction, each stale-read mutation is caught by a real-process test that holds the write lock; migrate takes no lock on an up to date database) |
| A8 | `proposeMove` is not atomic (row inserted before the stub is written) and overwrites an existing `move-<id>.js` | Plan 5 | **fixed** (proposal is one unit, an existing stub is kept as .old.js) |
| A9 | Read-only commands take a write lock through `touchWindow`, so `look` can wait behind a status line write | Plan 6 | open |

## B. Game rules and logic gaps

| Id | Finding | Source | Status |
|---|---|---|---|
| B1 | `--quest <id>` on `fight begin` accepts any existing quest id and skips the warning gate | Plan 5 | **fixed** (a quest fight needs a quest not solved this epoch) |
| B2 | Open moves are orphaned after flee, win, loss, or tamper, and `heroAttack` does not refuse while a move is open | Plan 5 | open |
| B3 | `warnNpc` needs no hero, no world, and no NPC presence | Plan 5 | open |
| B4 | The enemy's initiative roll is not linked in `fight_log` (only the hero's is) | Plan 5 | open |
| B5 | The ending unlock does not check the order of quests and boss: if quests are added later, solving them unlocks the ending again with no new boss win and no `endingUnlocked` flag for the Master | Plan 7 | **fixed** (the boss win must be after the latest solve of this epoch) |
| B6 | Knockout deadlock risk if N1 to N3 are all beaten (quest commands ignore gating, so the Master can still start quests by hand) | Plan 5 | open, mitigated: quest commands do not check the NPC, so the Master can always recover |
| B7 | `quest start`, `check`, and `judge` ignore gating, the hero, and the world | Plan 4 | **fixed** (hero, finished world, and earlier quests solved this epoch are required) |
| B8 | A location named like a slot (for example "L3") hijacks `go` | Plan 4 | open |
| B9 | A passing attempt from before a tamper reset can be judged after it (+8 honor without a re-check) | Plan 3 | open |
| B10 | A solve cannot be revoked by a later cheated verdict | Plan 3 | **fixed** (quest revoke built, solves can be taken back) |
| B11 | Reset overwrites level and abilities without snapshotting them for the ending page | Plan 2 | open |
| B12 | No CLI to list open fights or the honor history | Plan 2 | open |
| B13 | One quest per NPC in the skeleton limits the curriculum | Plan 4 | covered by the curriculum catalog (one NPC per rung, provisional) |

## C. Input validation and CLI behavior

| Id | Finding | Source | Status |
|---|---|---|---|
| C1 | Duplicate-name check misses inner whitespace and NBSP differences | Plan 4 | open |
| C2 | A non-string field error says "must not be empty" | Plan 4 | open |
| C3 | Zero-width-only names pass, no length caps, `NaN` prints as `null`, repeated flags and duplicate bonus keys keep the last one | Plan 4 | open |
| C4 | A bad option under a tamper exits 1 instead of 2 | Plan 4 | open |
| C5 | Extra positionals are silently dropped on older commands (for example `honor add 5 help helped the baker` stores "helped") | Plan 2 | verify, newer commands reject them |
| C6 | `JSDND_QUEST_TIMEOUT_MS` is unvalidated (0 hangs, NaN throws), test-only | Plan 3 | open |
| C7 | `quest.file` is metadata that disagrees with the real path when `JSDND_PLAYER_DIR` is set, and `quest check` and `quest list` do not print the file path | Plan 3 | **fixed** (quest start, check, and list print the real path) |

## D. Robustness and presentation

| Id | Finding | Source | Status |
|---|---|---|---|
| D1 | A never-settling promise gives a vague "your code stopped the program" error (matters for the async rungs 4 and 5) | Plans 3 and 5 | **fixed** (a never-settling promise gets a named error) |
| D2 | Lingering timers left by player code are not pinned | Plan 3 | open |
| D3 | The status line hangs if stdin never closes (`readFileSync(0)`) | Plan 6 | open |
| D4 | An estimate-based collapse says "1 hour" when only minutes remain | Plan 6 | open |
| D5 | Long y-axis labels can clip in the ending page charts | Plan 7 | open |
| D6 | The ending hours estimate skips `world_settings`, `npc_warnings`, and `npc_knockouts` timestamps | Plan 7 | open |

## E. Test gaps and flakiness

| Id | Finding | Source | Status |
|---|---|---|---|
| E1 | Two CLI tests use real `Math.random` on tough fights: about 0.8 percent of suite runs fail (one such red run was seen again during the style work) | Plan 5 | **fixed** (the two tests that needed a tough fight stage it through the library with a scripted rng, the rest use the weak tier where real dice cannot end the fight; ten clean runs of the CLI test file) |
| E2 | Hours tests are weak (some timestamp sources are unpinned) and no test uses more than one save | Plan 7 | **fixed** (every timestamp source and a second save are pinned) |
| E3 | Same-millisecond reset is not tested | Plan 7 | **fixed** (same-millisecond reset and solve are pinned) |
| E4 | Page tests miss attribute quoting, mark `<title>` escaping, the 300-dot cap, and the y clamp | Plan 7 | **fixed** (attribute quoting, mark titles, the dot cap, and the clamp are pinned) |
| E5 | Dice edge inputs (`D20`, trailing space, `007d06`) are not behavior-pinned | Plan 2 | **fixed** (edge inputs pinned) |
| E6 | Link suffix matching (`endsWith` mutation) is not pinned | Plan 3 | **fixed** (exact host matching pinned) |
| E7 | The forge test does not pin the random token, and the dice-roll generated inputs are not individually pinned | Plan 3 | **fixed** (argv and stdin token forge pinned, dice-roll mutants added) |
| E8 | No `heroAttack` rollback test, and the tamper gate test covers 3 of 7 combat commands | Plan 5 | **fixed** (attack rollback and the tamper gate across all seven combat commands) |
| E9 | The play.md drift guard is a substring check and checks no flags | Plan 4 | **fixed** (play.md flags are checked against the usage) |

## F. Docs

| Id | Finding | Source | Status |
|---|---|---|---|
| F1 | README sample uses the legacy `fight start` and has no example fight | Plan 5 | **fixed** (the README shows a real combat example) |
| F2 | The README tiredness row says play stops until the window resets, which holds for the listed commands only | Plan 6 | **fixed** (the collapse gate covers every play command) |

## G. Owner calls (decisions, not bugs)

| Id | Finding | Source |
|---|---|---|
| G1 | A tamper reset wipes race bonuses (a dwarf loses CON +2) per spec 5.8 | Plan 4 |
| G2 | Reading a legal doc counts as a hint and drops the clean bonus from +8 to +5 | Plan 3 |
| G3 | Player code is not sandboxed (accepted) | Plan 3 |
| G4 | The integrity fingerprint covers `game/dice.js` only, not `game/rolls.js` or `game/cli.js` | Plan 2 |

## Owner calls, decided 2026-11-08

- G1: a tamper reset keeps race bonuses (built).
- G2: reading a legal doc still counts as a hint (kept).
- G3: player code stays unsandboxed (accepted).
- G4: the fingerprint covers `game/dice.js` and `game/rolls.js` (built).
- B10: a late cheated verdict revokes a solve (built as `quest revoke`).

## Found by the final review of the findings plan, 2026-11-08

- Fixed: the parallel tests were blind because `migrate` took the write lock on every open (it now locks only for a missing migration, which also stops read-only commands from waiting behind a writer).
- Fixed: a missing or broken `game/dice.js` or `game/rolls.js` crashed the CLI instead of counting as tampering. `game/cli.js` is now a small front door that checks the seal first and then loads `game/cli-main.js`.
- Fixed: the README quest sample ran before a world existed.
- Fixed: a late revoke now also takes back the bonus the solve paid.
- Fixed: a revoked solve no longer shows in the ending stats. A cheated verdict leaving an NPC asleep is pinned.
- Accepted, not fixed: the `JSDND_DICE_PATH`, `JSDND_ROLLS_PATH`, and `JSDND_DICE_SEAL` overrides are honored in production (honor system, spec section 4). A one-line or malformed seal reads as "missing or broken". `move-<id>.old.js` is overwritten if it already exists. The never-settled error has no machine code field.

## Fixed since they were recorded

- Modifiers hook stopped at `heroStats`: fixed in Plan 6.
- Legacy `fight end` and `fight log` could close or write to a combat fight: fixed with `assertLegacyFight`.
- Spec 5.10 stale against the ending decisions: updated.
- Page tests did not pin the legacy-vs-boss unlock, the outcome filter, or a cross-save boss win: added in the Plan 7 fix pass.
