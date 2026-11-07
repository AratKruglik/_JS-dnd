# Game DB and Script Layer Implementation Plan (Plan 2 of 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the game SQLite DB, the dice script, the fight log, the honor log, dice-tamper detection with its reset, and the single script CLI the Master uses to reach all of it.

**Architecture:** A new zero-dependency `game/` directory in the style of `dev/`: one module per concern, `node:sqlite` for storage, `node:test` for tests. One DB opener applies the pragmas on every connection and runs ordered migrations. A CLI is the only thing the Master calls, and it checks the dice file's fingerprint before running any command.

**Tech Stack:** Node.js (`node:sqlite`, `node:test`, `node:crypto`), SQLite, bash.

**Spec:** `docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md` (sections 6, 5.7 fight log, 5.8). Approved decisions for this plan are in the "Decisions" section below.

## Global Constraints

- Em-dash (U+2014) and en-dash (U+2013) never appear anywhere: code, comments, tests, docs, output. Build the characters with `String.fromCharCode` in tests; the owner's editor hook rewrites literal ones.
- No git commands unless the owner asks. Each task ends with a checkpoint, not a commit.
- Ask the owner before any outward-facing action.
- Game state lives only in SQLite reached through scripts. No JSON or markdown files as game state.
- The game DB is gitignored (`data/`) and separate from the dev notes DB (`.dev/`).
- Every DB connection sets WAL, `synchronous=NORMAL`, a busy timeout of 5000, and `foreign_keys=ON`.
- One setup script after cloning, no Docker.
- Deterministic work is code. Only judgment work is AI.
- Claude Code is the first host. Script output is compact JSON to keep tokens low.
- Random source for dice is `Math.random`.

## Decisions

Approved by the owner for this plan:
- The real dice script is read-only for the player. The early quest has them inspect it and write their own separate copy elsewhere. Editing the real file is the tamper.
- Tamper reset keeps all history and logs a reset marker. It resets level to 1, abilities to 8 with no trait points, honor to the floor, and restarts quest progress. Name, race, class, world, locations, and NPCs stay.
- Plan 2 builds only the tables it needs. Locations, NPCs, and quests arrive with Plans 3 and 4 as later migrations.
- Tamper detection is built here, not in Plan 5.
- Game DB path: `data/game.db`.

Calls made while planning (the owner can reject any):
- Six abilities: STR, DEX, CON, INT, WIS, CHA. Initiative is derived from DEX in Plan 5.
- Honor runs from -100 to 100, starts at 0, and each event stores `honor_after`, clamped at write time.
- Dice: d4, d6, d8, d10, d12, d20, d100. Roll count 1 to 100.
- Fight outcomes: `won`, `lost`, `fled`, `abandoned`.
- `game/dice.js` stays pure (no DB import) because the player reads it. Logging a roll lives in `game/rolls.js`.
- A missing dice file counts as tampered. A missing seal file is a broken install, not tamper: the CLI reports it and does not reset.
- One reset per distinct tampered fingerprint (`missing` is its own fingerprint). Commands exit 2 until the dice file is restored.
- The MVP has one save per install. `init` creates save 1 and every CLI command uses the lowest save id.
- Leveling rules are undefined in the spec. Plan 2 stores and resets `level` only.
- `JSDND_GAME_DB` and `JSDND_DICE_PATH` env overrides exist for tests. A player could use them to dodge the check; accepted, since enforcement is an honor system.

## Review Focus

1. Dice file stays modified: exactly one reset per distinct fingerprint and commands stay blocked until it is restored (Tasks 6, 7).
2. Dice file missing or unreadable: treated as tamper, not a crash (Tasks 6, 7).
3. Honor at the floor and ceiling stays consistent, including across a reset (Tasks 3, 6).
4. Fight log is ordered and gapless, and takes no writes after the fight ends (Task 5).
5. Bad dice input (0 sides, 1000 dice, non-integers) fails with a clear error and never rolls or logs (Task 4).

## File Structure

| Path | Responsibility |
|---|---|
| `game/schema.js` | `MIGRATIONS` array |
| `game/db.js` | `defaultGameDbPath`, `openGameDb`, `migrate` |
| `game/hero.js` | Saves, hero, abilities |
| `game/honor.js` | Honor events and history |
| `game/dice.js` | Pure, player-readable dice (`parseSpec`, `roll`) |
| `game/rolls.js` | `rollAndLog` |
| `game/fights.js` | Fights and fight log |
| `game/integrity.js` | `sealDice`, `checkDice` |
| `game/reset.js` | `applyTamperReset` |
| `game/dice.sha256` | Sealed fingerprint of `game/dice.js` |
| `game/cli.js` | The only entry point the Master calls |
| `tests/game/*.test.js` | One suite per module |

### Schema (migration 1)

All timestamps are ISO text. Every statement is `CREATE TABLE`.

- `saves(id INTEGER PRIMARY KEY, name TEXT, created_at TEXT NOT NULL)`
- `heroes(id INTEGER PRIMARY KEY, save_id INTEGER NOT NULL UNIQUE REFERENCES saves(id), name TEXT NOT NULL, race TEXT NOT NULL, hero_class TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1), created_at TEXT NOT NULL)`
- `hero_abilities(hero_id INTEGER NOT NULL REFERENCES heroes(id), ability TEXT NOT NULL CHECK (ability IN ('STR','DEX','CON','INT','WIS','CHA')), base INTEGER NOT NULL DEFAULT 8, trait_adjust INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (hero_id, ability))`
- `honor_events(id INTEGER PRIMARY KEY, save_id INTEGER NOT NULL REFERENCES saves(id), created_at TEXT NOT NULL, delta INTEGER NOT NULL, kind TEXT NOT NULL, reason TEXT NOT NULL, honor_after INTEGER NOT NULL CHECK (honor_after BETWEEN -100 AND 100))`
- `dice_rolls(id INTEGER PRIMARY KEY, save_id INTEGER NOT NULL REFERENCES saves(id), created_at TEXT NOT NULL, spec TEXT NOT NULL, results TEXT NOT NULL, total INTEGER NOT NULL, context TEXT)`
- `fights(id INTEGER PRIMARY KEY, save_id INTEGER NOT NULL REFERENCES saves(id), started_at TEXT NOT NULL, ended_at TEXT, trigger_reason TEXT NOT NULL, outcome TEXT CHECK (outcome IN ('won','lost','fled','abandoned')))` (`trigger` is a SQL keyword, hence the column name)
- `fight_log(id INTEGER PRIMARY KEY, fight_id INTEGER NOT NULL REFERENCES fights(id), seq INTEGER NOT NULL, created_at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, roll_id INTEGER REFERENCES dice_rolls(id), detail TEXT, UNIQUE (fight_id, seq))`
- `resets(id INTEGER PRIMARY KEY, save_id INTEGER NOT NULL REFERENCES saves(id), created_at TEXT NOT NULL, reason TEXT NOT NULL, fingerprint_expected TEXT NOT NULL, fingerprint_found TEXT NOT NULL, UNIQUE (save_id, fingerprint_found))`
- `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`

---

### Task 1: Game DB and migrations

**Files:**
- Create: `game/schema.js`, `game/db.js`, `tests/game/db.test.js`
- Modify: `.gitignore` (add `data/`)

**Interfaces:**
- Produces: `MIGRATIONS: { version: number, sql: string }[]`; `defaultGameDbPath(): string` (env `JSDND_GAME_DB`, else repo-root `data/game.db` resolved from `import.meta.url`); `openGameDb(path?: string): DatabaseSync`; `migrate(db: DatabaseSync): void`.

- [ ] **Step 1: Write the failing tests** in `tests/game/db.test.js`:
  - `openGameDb creates missing directories and applies pragmas`: `foreign_keys` 1, `journal_mode` `'wal'`, `busy_timeout` column `timeout` 5000.
  - `migrate is idempotent`: opening the same file twice leaves `schema_migrations` versions equal to `[1]`.
  - `defaultGameDbPath does not depend on the current directory`: same value before and after `process.chdir` to a temp dir, absolute, ends with `data/game.db`, and returns the env value when `JSDND_GAME_DB` is set.
  - `heroes, honor_events, dice_rolls, fights, and resets all have a save_id column` via `PRAGMA table_info`.
- [ ] **Step 2: Run** `node --test tests/game/db.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the schema above as migration 1 and the three functions. Follow `dev/db.js` for the pragma and path pattern.
- [ ] **Step 4: Run** the same command. Expected: PASS (4 tests).
- [ ] **Step 5: Checkpoint.** Report changed files. No git.

---

### Task 2: Saves and hero rows

**Files:**
- Create: `game/hero.js`, `tests/game/hero.test.js`

**Interfaces:**
- Consumes: `openGameDb` (Task 1).
- Produces: `ABILITIES = ['STR','DEX','CON','INT','WIS','CHA']`; `createSave(db, { name?: string }): number`; `createHero(db, saveId: number, { name: string, race: string, heroClass: string }): number`; `getHero(db, saveId: number): Hero | null` where `Hero = { id, saveId, name, race, heroClass, level, abilities: Record<Ability, { base: number, traitAdjust: number }> }`.

- [ ] **Step 1: Write the failing tests:**
  - `createHero sets level 1 and every ability to base 8 with no trait adjustment`.
  - `a second createHero for the same save throws`.
  - `an ability outside the six is rejected by the schema` (insert `'LUCK'` directly).
  - `getHero returns null when the save has no hero`.
- [ ] **Step 2: Run** `node --test tests/game/hero.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the three functions. Point-buy validation is Plan 4, not here.
- [ ] **Step 4: Run** the same command. Expected: PASS (4 tests).
- [ ] **Step 5: Checkpoint.** Report changed files. No git.

---

### Task 3: Honor events

**Files:**
- Create: `game/honor.js`, `tests/game/honor.test.js`

**Interfaces:**
- Consumes: `createSave` (Task 2).
- Produces: `HONOR_MIN = -100`, `HONOR_MAX = 100`; `addHonorEvent(db, saveId: number, { delta: number, kind: string, reason: string }): number` (returns `honor_after`); `getHonor(db, saveId: number): number`; `getHonorHistory(db, saveId: number): { id, createdAt, delta, kind, reason, honorAfter }[]` in insertion order.

- [ ] **Step 1: Write the failing tests:**
  - `getHonor starts at 0`.
  - `addHonorEvent stores honor_after and getHonor returns the latest`.
  - `honor clamps at the ceiling and the floor`: +150 returns 100, then -300 returns -100, and the raw deltas stay stored.
  - `delta must be a finite integer`: `NaN`, `1.5`, and `Infinity` throw and write nothing.
  - `history keeps insertion order`.
- [ ] **Step 2: Run** `node --test tests/game/honor.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** `honor_after = clamp(previous + delta)`, previous being the latest `honor_after` or 0.
- [ ] **Step 4: Run** the same command. Expected: PASS (5 tests).
- [ ] **Step 5: Checkpoint.** Report changed files. No git.

---

### Task 4: Dice script

**Files:**
- Create: `game/dice.js`, `game/rolls.js`, `tests/game/dice.test.js`

**Interfaces:**
- Produces in `game/dice.js` (pure, no imports from the project, heavily commented because the player reads it in a quest): `SIDES = [4,6,8,10,12,20,100]`; `parseSpec(spec: string): { count: number, sides: number }` (accepts `NdM` and `dM`); `roll(spec: string, rng?: () => number): { spec, count, sides, results: number[], total: number }` where each result is `Math.floor(rng() * sides) + 1`.
- Produces in `game/rolls.js`: `rollAndLog(db, saveId: number, spec: string, context?: string, rng?: () => number): { id: number, spec, count, sides, results, total }`.

- [ ] **Step 1: Write the failing tests:**
  - `parseSpec and roll reject bad input`: `'0d6'`, `'101d6'`, `'1d7'`, `'d'`, `'abc'`, `'1.5d6'`, `'-1d6'`, and `''` each throw an error whose message mentions dice.
  - `roll maps rng 0 to 1 and 0.999999 to the top face` for a d20.
  - `roll returns count results and their sum as total` using an rng sequence.
  - `statistical sanity`: 6000 d6 rolls with the real `Math.random` land every face between 800 and 1200 times.
  - `rollAndLog stores the roll and returns its id`: row has spec, JSON results, total, context.
  - `a rejected spec writes nothing`: `dice_rolls` count stays 0.
- [ ] **Step 2: Run** `node --test tests/game/dice.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** both files. Keep `dice.js` short and readable, since a beginner studies it.
- [ ] **Step 4: Run** the same command. Expected: PASS (6 tests).
- [ ] **Step 5: Checkpoint.** Report changed files. No git. Note that any later edit to `game/dice.js` needs a re-seal (Task 6).

---

### Task 5: Fights and fight log

**Files:**
- Create: `game/fights.js`, `tests/game/fights.test.js`

**Interfaces:**
- Consumes: `rollAndLog` (Task 4).
- Produces: `startFight(db, saveId: number, { triggerReason: string }): number`; `logFightStep(db, fightId: number, { actor: string, action: string, rollId?: number | null, detail?: string }): number` (returns `seq`, starting at 1); `endFight(db, fightId: number, outcome: 'won' | 'lost' | 'fled' | 'abandoned'): void`; `getFightLog(db, fightId: number): { seq, createdAt, actor, action, rollId, detail }[]` ordered by `seq`.

- [ ] **Step 1: Write the failing tests:**
  - `startFight creates an open fight with no outcome`.
  - `logFightStep numbers steps 1, 2, 3 with no gaps`.
  - `logFightStep links a dice roll and rejects an unknown roll id`.
  - `logFightStep on an ended fight throws and writes nothing`.
  - `endFight twice throws`.
  - `getFightLog returns steps in seq order`.
  - `seq is unique per fight` (direct duplicate insert throws).
- [ ] **Step 2: Run** `node --test tests/game/fights.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Compute `seq` and insert inside one `BEGIN IMMEDIATE` transaction so numbering cannot gap.
- [ ] **Step 4: Run** the same command. Expected: PASS (7 tests).
- [ ] **Step 5: Checkpoint.** Report changed files. No git.

---

### Task 6: Integrity and tamper reset

**Files:**
- Create: `game/integrity.js`, `game/reset.js`, `game/dice.sha256` (written by `sealDice`), `tests/game/integrity.test.js`

**Interfaces:**
- Consumes: `addHonorEvent`, `HONOR_MIN` (Task 3), `createHero`, `getHero` (Task 2).
- Produces: `sealDice(dicePath?: string, sealPath?: string): string` (writes the SHA-256 hex plus newline, returns it); `checkDice(opts?: { dicePath?: string, sealPath?: string }): { ok: true } | { ok: false, reason: 'modified' | 'missing' | 'seal-missing', expected: string | null, found: string }` where `found` is the hash or the literal `'missing'`; `applyTamperReset(db, saveId: number, { expected: string, found: string }): { applied: boolean }`. Dice path default is env `JSDND_DICE_PATH`, else `game/dice.js`.
- `applyTamperReset` runs in one `BEGIN IMMEDIATE` transaction: insert the `resets` row, add an honor event of kind `reset` that lands on `HONOR_MIN`, set hero level to 1, set every ability to base 8 and trait_adjust 0. A repeated `found` for the same save returns `{ applied: false }` and writes nothing. No hero for the save throws and rolls everything back.

- [ ] **Step 1: Write the failing tests:**
  - `the sealed hash matches game/dice.js`: fails with a message telling the developer to run `node game/seal.js` (a developer-only script, kept out of the player CLI after the review).
  - `checkDice passes on an untouched sealed copy`.
  - `checkDice reports modified when one byte changes`.
  - `checkDice reports missing when the dice file is gone`.
  - `applyTamperReset sets level 1, abilities 8 with no trait adjust, and honor at the floor`.
  - `applyTamperReset keeps name, race, class, earlier honor events, and fights`.
  - `applyTamperReset is idempotent per fingerprint`: second call returns `applied: false` and adds no rows.
  - `a new tampered fingerprint resets again`.
  - `applyTamperReset is atomic`: a save with no hero throws and leaves no `resets` or `honor_events` rows.
  - `honor stays consistent across a reset`: after reset `getHonor` is -100, and a following +10 gives -90.
- [ ] **Step 2: Run** `node --test tests/game/integrity.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** both files with `node:crypto` and `node:fs`. Then run `sealDice()` once to create `game/dice.sha256`.
- [ ] **Step 4: Run** the same command. Expected: PASS (10 tests).
- [ ] **Step 5: Checkpoint.** Report changed files. No git.

---

### Task 7: Script CLI, setup, and README

**Files:**
- Create: `game/cli.js`, `tests/game/cli.test.js`
- Modify: `setup.sh`, `tests/setup.test.js`, `README.md`

**Interfaces:**
- Consumes: Tasks 1 to 6.
- Produces `node game/cli.js <command>`. Success prints one line of compact JSON to stdout and exits 0. Errors print one line of JSON to stderr and exit 1. Tamper or missing dice prints a notice and exits 2. Commands:
  - `init` (create DB, run migrations, create save 1 if none; idempotent)
  - `hero new <name> <race> <class>`, `hero show`
  - `roll <spec> [--context "<text>"]`
  - `honor add <delta> <kind> "<reason>"`, `honor show`
  - `fight start "<reason>"`, `fight log <fightId> <actor> <action> [--roll <rollId>] ["<detail>"]`, `fight end <fightId> <won|lost|fled|abandoned>`, `fight show <fightId>`
  - `integrity check` (sealing lives in the developer-only `game/seal.js`)
- Every command runs `checkDice` first. On tamper it calls `applyTamperReset` (skipped when the save has no hero yet) and exits 2. A `seal-missing` result exits 1 with a clear message and does not reset.

- [ ] **Step 1: Write the failing tests** in `tests/game/cli.test.js`, using `spawnSync` with `JSDND_GAME_DB` and `JSDND_DICE_PATH` pointed at temp files (a sealed copy of `game/dice.js`):
  - `init creates the DB and one save and is safe to run twice`.
  - `roll prints one line of compact JSON with results and total and logs the roll`.
  - `fight round trip`: start, two logs, end, show returns two ordered steps.
  - `tampered dice: first command exits 2 and resets, a second command exits 2 and does not reset again, and restoring the file makes commands work again`.
  - `a missing dice file exits 2 and resets`.
  - `a bad roll spec exits 1 with a JSON error and no roll row`.
  - `integrity check on a sealed copy exits 0`.
  - In `tests/setup.test.js` add `setup.sh creates the game DB`: run with `JSDND_GAME_DB` set to a temp path; the file exists and the output still says `Setup complete`.
- [ ] **Step 2: Run** `node --test tests/game/cli.test.js tests/setup.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `game/cli.js` in the dispatch and `fail()` style of `dev/cli.js`. Extend `setup.sh` to create the data directory and run `node game/cli.js init` after the Node checks.
- [ ] **Step 4: Update `README.md`.** Move the tamper-detection row from Plan 5 to Plan 2, set Plan 2 rows to Done as they land, and add the `node game/cli.js` commands under "Try what exists".
- [ ] **Step 5: Run the whole suite** with `node --test`. Expected: all PASS, plus the dash scan `grep -rnP '[\x{2013}\x{2014}]' game tests README.md` printing nothing.
- [ ] **Step 6: Checkpoint.** Report changed files. No git.

---

## Left to the owner

- License, the certificate, and how `setup.sh` installs Node stay open and do not block this plan.
- Leveling rules and quest-progress tables belong to Plans 3 and 4.

## Self-review notes

- Spec coverage: section 6 (SQLite, scripts only, save id, pragmas) maps to Tasks 1 and 7; 5.7 fight log maps to Task 5; 5.8 dice integrity maps to Tasks 4, 6, and 7.
- Type consistency: `saveId`, `fightId`, `rollId`, `heroClass`, and `triggerReason` are camelCase in JS and snake_case in SQL throughout.
- Proportion: about the length of the Plan 1 plan, with code only in test names and schema.
