# Quest Engine Implementation Plan (Plan 3 of 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the quest loop: a player writes code in a named file, a script runs it against fixed checks (step 1), the Master's cheating verdict is recorded (step 2), and honor, hints, legal links, and tone follow. Ship it with three starter quests.

**Architecture:** Quest content lives in the repo as small JS modules with fixed checks. A runner executes the player's file in a child process with a timeout, so a bad file can never hang or crash the game. The engine in `game/` records attempts, judgments, hints, and solves in new tables, and everything is reached through new `game/cli.js` commands.

**Tech Stack:** Node.js (`node:sqlite`, `node:test`, `node:child_process`), SQLite.

**Spec:** `docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md` (sections 5.3, 5.5, 5.6). Builds on Plan 2: `game/db.js`, `game/honor.js`, `game/reset.js`, `game/cli.js`.

## Global Constraints

- Em-dash (U+2014) and en-dash (U+2013) never appear anywhere: code, comments, tests, docs, output. Build the characters with `String.fromCharCode` in tests; the owner's editor hook rewrites literal ones.
- No git commands unless the owner asks. Each task ends with a checkpoint.
- Ask the owner before any outward-facing action.
- Game state lives only in SQLite reached through scripts. Quest content (checks, briefs) is repo code, not game state. No JSON or markdown files as game state.
- Every DB connection sets WAL, `synchronous=NORMAL`, `busy_timeout` first, and `foreign_keys=ON`; use `openGameDb` only.
- Quest checks are fixed in the repo and the Master only reskins the story (spec 5.5). Step 1 is a plain script with no AI.
- If step 1 fails, honor does not change and the file is not read (spec 5.5).
- Feedback tone starts only after step 1 passes (spec 5.5).
- Legal links are exactly: MDN, W3Schools, ECMAScript spec (tc39.es/ecma262), Node.js docs (nodejs.org/docs), WHATWG Fetch (fetch.spec.whatwg.org), javascript.info, Eloquent JavaScript. Everything else is illegal (spec 5.6).
- Script output is one line of compact JSON; errors are one line of JSON on stderr with exit 1; tamper exits 2 (Plan 2 contract).

## Decisions

Approved by the owner for this plan:
- Plan 3 ships the engine plus **3 starter quests**: the dice quest, one strings quest, one arrays quest. The full curriculum is written later as content, quest by quest.
- The tone switches to roasting when honor is **below 0**. At 0 and above it is gentle.
- Player files live in a **`player/` folder in the repo, gitignored**.

Calls made while planning (the owner can reject any):
- Player code runs unsandboxed in a child process on the player's own machine, with a 5 second default timeout (10 for async quests). A sandbox is out of scope.
- Checks use generated inputs compared against a reference answer inside the check, so a hardcoded return value fails step 1. This cuts how often the Master has to judge for cheating.
- Quests are JS modules in `quests/`, each exporting metadata and an async `check`. Quest order is the array order in `quests/index.js`.
- A quest counts as **solved only on a `clean` verdict**. A `cheated` verdict costs honor and the quest stays unsolved.
- A tamper reset makes every quest unsolved again by comparing an `epoch` (the number of resets so far) stored on each solve. Attempts, judgments, and honor events are kept.
- Honor deltas are not in the spec. Defaults live in one table, `HONOR_RULES`: `clean_solve` +5, `clean_solve_no_hints` +8, `cheat` -15, `illegal_link` -2, `master_leak` -2, `swearing` -2, `insult_npc` -3, `deviant` -5, `vandalism` -3, `kill_unprovoked` -15, `kill_self_defense` 0, `kindness` +2, `help_attempt` +5, `help_success` +8, `greeting` +1.
- The Master applies conduct events with `honor event <kind>` so the numbers stay consistent and cheap.
- The legal-link check matches the exact host (with or without `www.`), requires `http` or `https`, and for `nodejs.org` requires a path under `/docs` or `/api`. The exact domains for javascript.info and Eloquent JavaScript are verified by the builder before they are listed.
- New CLI commands reject extra arguments instead of silently dropping them (a Plan 2 review minor).
- `JSDND_PLAYER_DIR` env override exists for tests.

## Review Focus

1. Player code that loops forever, throws, calls `process.exit`, or has a syntax error: step 1 returns a status and never hangs or crashes the CLI (Tasks 3, 6).
2. A hardcoded return value fails step 1 on every starter quest (Task 4).
3. Judging is only valid after a passing, unjudged attempt; a failed check never changes honor; judging twice is rejected (Task 5).
4. After a tamper reset, solved quests count as unsolved again while attempts and honor history remain (Task 5).
5. Link lookalikes (host suffix tricks, `user@host` tricks, non-http schemes, odd casing) are classified illegal (Task 2).

## File Structure

| Path | Responsibility |
|---|---|
| `game/schema.js` | Add migration 2 |
| `game/honor-rules.js` | `HONOR_RULES`, `toneFor`, `applyHonorRule` |
| `game/links.js` | `LEGAL_SOURCES`, `classifyLink` |
| `quests/index.js` | Ordered `QUESTS`, `getQuest` |
| `quests/run-check.js` | Child process entry: load quest and player file, print result |
| `quests/dice-roll.js`, `string-shout.js`, `array-sum.js` | The three starter quests |
| `game/quest-runner.js` | `runQuestCheck` (spawns the child, never throws) |
| `game/quests.js` | The engine: start, check, judge, hint, progress |
| `game/cli.js` | New `quest`, `link`, and `honor event` commands |
| `tests/quests/solutions/` | Reference, wrong, and hardcoded solutions used by tests |
| `tests/game/*.test.js`, `tests/quests/*.test.js` | Suites |
| `player/` | Created at runtime, gitignored |

### Schema (migration 2)

- `quest_attempts(id INTEGER PRIMARY KEY, save_id INTEGER NOT NULL REFERENCES saves(id), quest_id TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pass','fail','error','timeout')), expected TEXT NOT NULL, got TEXT NOT NULL, message TEXT NOT NULL, complexity INTEGER NOT NULL)`
- `quest_judgments(id INTEGER PRIMARY KEY, attempt_id INTEGER NOT NULL UNIQUE REFERENCES quest_attempts(id), created_at TEXT NOT NULL, verdict TEXT NOT NULL CHECK (verdict IN ('clean','cheated')), note TEXT)`
- `quest_solves(id INTEGER PRIMARY KEY, save_id INTEGER NOT NULL REFERENCES saves(id), quest_id TEXT NOT NULL, attempt_id INTEGER NOT NULL REFERENCES quest_attempts(id), solved_at TEXT NOT NULL, epoch INTEGER NOT NULL, hints_used INTEGER NOT NULL, complexity INTEGER NOT NULL, UNIQUE (save_id, quest_id, epoch))`
- `quest_hints(id INTEGER PRIMARY KEY, save_id INTEGER NOT NULL REFERENCES saves(id), quest_id TEXT NOT NULL, created_at TEXT NOT NULL, epoch INTEGER NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('npc_speech','legal_doc','illegal_doc','master_leak')), note TEXT)`

---

### Task 1: Migration 2, honor rules, and tone

**Files:**
- Modify: `game/schema.js`
- Create: `game/honor-rules.js`, `tests/game/honor-rules.test.js`

**Interfaces:**
- Consumes: `addHonorEvent`, `getHonor` (Plan 2).
- Produces: `HONOR_RULES: Record<string, number>` (values exactly as in Decisions); `toneFor(honor: number): 'gentle' | 'roast'` (below 0 is `roast`); `applyHonorRule(db, saveId: number, kind: string, note?: string): number` (returns `honor_after`; an unknown kind throws before writing).

- [ ] **Step 1: Write the failing tests:**
  - `migration 2 creates the four quest tables and leaves migration 1 intact`: `schema_migrations` versions are `[1, 2]`.
  - `toneFor is gentle at 0 and above and roast below 0`: -1, 0, 1, -100, 100.
  - `applyHonorRule applies the table delta and logs the kind`: `cheat` from 0 gives -15 and history shows kind `cheat`.
  - `applyHonorRule clamps through addHonorEvent`: ten `kill_unprovoked` events stop at -100.
  - `applyHonorRule rejects an unknown kind and writes nothing`.
  - `kill_self_defense is a valid kind that changes nothing`: delta 0.
- [ ] **Step 2: Run** `node --test tests/game/honor-rules.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** migration 2 (the schema above, appended to `MIGRATIONS`) and `game/honor-rules.js`.
- [ ] **Step 4: Run** the same command, then `node --test`. Expected: PASS (6 tests), full suite green.
- [ ] **Step 5: Checkpoint.** Report changed files. No git.

---

### Task 2: Legal-link classifier

**Files:**
- Create: `game/links.js`, `tests/game/links.test.js`

**Interfaces:**
- Produces: `LEGAL_SOURCES: { host: string, pathPrefixes?: string[] }[]`; `classifyLink(url: string): { legal: boolean, host: string | null }`. Host is lowercased and `www.` is stripped. Never throws: garbage returns `{ legal: false, host: null }`.

- [ ] **Step 1: Write the failing tests:**
  - `each of the seven legal sources is legal`: one real URL per source, including `https://developer.mozilla.org/en-US/docs/Web/JavaScript`, `https://www.w3schools.com/js/`, `https://tc39.es/ecma262/`, `https://nodejs.org/docs/latest/api/`, `https://fetch.spec.whatwg.org/`.
  - `casing and www do not matter`: `HTTPS://WWW.W3SCHOOLS.COM/js/` is legal.
  - `lookalikes are illegal`: `https://developer.mozilla.org.evil.com/`, `https://evil.com/developer.mozilla.org`, `https://developer.mozilla.org@evil.com/`, `https://notmdn.com`.
  - `non-http schemes and garbage are illegal and do not throw`: `javascript:alert(1)`, `ftp://developer.mozilla.org/`, `''`, `'not a url'`, `undefined`.
  - `nodejs.org outside docs and api is illegal`: `https://nodejs.org/en/blog/`.
  - `other well-known sites are illegal`: `https://stackoverflow.com/questions/1`.
- [ ] **Step 2: Run** `node --test tests/game/links.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** with the `URL` class and the exact-host rule from Decisions. Verify the javascript.info and Eloquent JavaScript domains before listing them (web check, note the result in the ledger).
- [ ] **Step 4: Run** the same command. Expected: PASS (6 tests).
- [ ] **Step 5: Checkpoint.** Report changed files. No git.

---

### Task 3: Quest registry and runner

**Files:**
- Create: `quests/index.js`, `quests/run-check.js`, `game/quest-runner.js`, `tests/game/quest-runner.test.js`, `tests/fixtures/quests/` (test-only quest and player files)

**Interfaces:**
- Produces: `type Quest = { id: string, title: string, rung: number, complexity: number, file: string, brief: string, stub: string, timeoutMs?: number, check(mod: object): Promise<{ pass: boolean, expected: string, got: string, message?: string }> }`; `QUESTS: Quest[]` and `getQuest(id: string): Quest | undefined` from `quests/index.js`; `runQuestCheck(questId: string, playerPath: string, opts?: { timeoutMs?: number, questsModule?: string }): { status: 'pass' | 'fail' | 'error' | 'timeout', expected: string, got: string, message: string }`. `runQuestCheck` is synchronous, spawns `node quests/run-check.js`, and never throws. `questsModule` lets tests point the child at a fixture registry.

- [ ] **Step 1: Write the failing tests** using a fixture quest `echo` whose check calls `mod.answer()` and expects `42`:
  - `a correct player file passes`.
  - `a wrong answer fails and reports got and expected`: got `41`, expected `42`.
  - `a syntax error returns error with a one-line message`.
  - `a file that throws on import returns error`.
  - `an infinite loop returns timeout quickly` (timeout 500 ms, test finishes under 3 s).
  - `process.exit(0) inside the player file does not read as a pass`: status `error`.
  - `a missing player file returns error saying the file is missing`.
  - `an unknown quest id returns error`.
  - `output the player prints cannot forge a result`: the player file `console.log`s a fake pass line and the status is still `fail`.
- [ ] **Step 2: Run** `node --test tests/game/quest-runner.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** The child prints the result on a reserved marker line (a random token passed by the parent) so player output cannot forge it. Parent reads only that line.
- [ ] **Step 4: Run** the same command. Expected: PASS (9 tests).
- [ ] **Step 5: Checkpoint.** Report changed files. No git.

---

### Task 4: The three starter quests

**Files:**
- Create: `quests/dice-roll.js`, `quests/string-shout.js`, `quests/array-sum.js`, `tests/quests/starter-quests.test.js`, `tests/quests/solutions/` (reference, wrong, and hardcoded files per quest)
- Modify: `quests/index.js` (register them in this order)

**Interfaces:**
- Consumes: `runQuestCheck` (Task 3).
- Produces three quests, each with an ESM stub the player edits at `player/<id>.js`:
  - `dice-roll` (rung 1, complexity 2): player exports `rollDie(sides: number, rng?: () => number): number`. Check: `rng` 0 gives 1 and `rng` 0.999999 gives `sides` for sides 6 and 20; 600 real d6 rolls are integers 1 to 6 and hit all six faces.
  - `string-shout` (rung 1, complexity 1): player exports `shout(text: string): string`. Trims, uppercases, appends `!`. Fixed cases: `'hello'` gives `'HELLO!'`, `'  hi there '` gives `'HI THERE!'`, `''` gives `'!'`. Plus 20 generated strings compared with the reference.
  - `array-sum` (rung 1, complexity 2): player exports `sumEven(numbers: number[]): number`. Fixed cases: `[1,2,3,4]` gives 6, `[]` gives 0, `[-2,3]` gives -2, `[1,3]` gives 0. Plus 20 generated arrays compared with the reference.
  - Each check's `got` and `expected` strings show the failing input in plain words (for example `sumEven([1,2,3,4])`).

- [ ] **Step 1: Write the failing tests**, per quest:
  - `<id>: the reference solution passes`.
  - `<id>: a wrong solution fails with a readable got and expected`.
  - `<id>: a hardcoded solution fails` (returns the fixed-case answers by lookup; generated inputs break it).
  - Plus `the registry lists the three quests in order with unique ids, files under player/, and complexity 1 to 5`.
- [ ] **Step 2: Run** `node --test tests/quests/starter-quests.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the quests, stubs, and registry entries. Briefs are plain setting-neutral text; the Master reskins them.
- [ ] **Step 4: Run** the same command. Expected: PASS (10 tests).
- [ ] **Step 5: Checkpoint.** Report changed files. No git.

---

### Task 5: The engine

**Files:**
- Create: `game/quests.js`, `tests/game/quests.test.js`

**Interfaces:**
- Consumes: Tasks 1 to 4, `addHonorEvent`, `getHonor`, `applyTamperReset` (Plan 2).
- Produces:
  - `startQuest(questId: string, opts?: { playerDir?: string }): { questId, file, created: boolean, brief }` (writes the stub only if the file does not exist; creates the folder).
  - `checkQuest(db, saveId, questId, opts?: { playerDir?, timeoutMs? }): { attemptId, status, expected, got, message, next: 'retry' | 'judge', tone?: 'gentle' | 'roast' }`. Records an attempt every time. `tone` appears only when `next` is `judge`. Honor never changes here.
  - `judgeQuest(db, saveId, questId, verdict: 'clean' | 'cheated', note?: string): { solved: boolean, honor: number }`. Valid only for the latest attempt of that quest when it passed and has no judgment yet. `clean` records the solve and applies `clean_solve_no_hints` when no hints were used this epoch, else `clean_solve`. `cheated` applies `cheat` and records no solve.
  - `logHint(db, saveId, questId, kind: 'npc_speech' | 'legal_doc' | 'illegal_doc' | 'master_leak', note?: string): { hintsUsed: number }`. `illegal_doc` applies `illegal_link`, `master_leak` applies `master_leak`.
  - `getProgress(db, saveId): { epoch: number, solved: string[], remaining: string[], total: number }`.

- [ ] **Step 1: Write the failing tests** with fixture player files:
  - `startQuest writes the stub once and never overwrites the player's work`.
  - `a failed check records an attempt, returns retry with got and expected, and leaves honor unchanged`.
  - `a passing check returns judge with gentle tone at honor 0 and roast tone below 0`.
  - `judge clean records the solve and gives +8 with no hints, +5 after a hint`.
  - `judge cheated costs 15 honor and records no solve`.
  - `judging without a passing attempt is rejected, and so is judging twice`.
  - `judging applies to the latest attempt only`: a later failing attempt blocks judging an older pass.
  - `logHint counts hints per quest per epoch and applies honor for illegal_doc and master_leak only`.
  - `after a tamper reset solved quests count as unsolved while attempts, judgments, and honor history remain`.
  - `a quest can be solved again after a reset and the old solve stays`.
  - `getProgress lists solved and remaining in registry order`.
- [ ] **Step 2: Run** `node --test tests/game/quests.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** `epoch` is the count of `resets` rows for the save. Wrap judging in one transaction (`inTransaction`) so a solve and its honor event commit together.
- [ ] **Step 4: Run** the same command, then `node --test`. Expected: PASS (11 tests), full suite green.
- [ ] **Step 5: Checkpoint.** Report changed files. No git.

---

### Task 6: CLI commands, gitignore, README

**Files:**
- Modify: `game/cli.js`, `.gitignore` (add `player/`), `README.md`, `tests/game/cli.test.js`

**Interfaces:**
- Consumes: Tasks 1 to 5.
- Produces commands (one line of JSON each; extra arguments are rejected with a JSON error):
  - `quest list`, `quest start <id>`, `quest check <id>`, `quest judge <id> <clean|cheated> ["<note>"]`, `quest hint <id> <npc_speech|legal_doc|illegal_doc|master_leak> ["<note>"]`, `quest progress`
  - `link check <url>` (prints `{ ok, legal, host }`) and `link use <questId> <url>` (classifies, logs a `legal_doc` or `illegal_doc` hint, applies honor for illegal)
  - `honor event <kind> ["<note>"]` (applies `HONOR_RULES`)

- [ ] **Step 1: Write the failing tests** (spawn with the same temp-install helper as Plan 2, plus `JSDND_PLAYER_DIR`):
  - `quest list shows three quests unsolved with complexity`.
  - `quest start writes the stub and a second start does not overwrite edits`.
  - `a full loop: start, write the reference solution, check passes with tone, judge clean, progress shows one solved, honor went up`.
  - `quest check on a failing file prints got and expected and exits 0 with next retry`.
  - `an infinite-loop player file returns status timeout and the CLI still exits 0`.
  - `link check classifies a legal and an illegal link`; `link use with an illegal link lowers honor by 2 and logs a hint`.
  - `honor event swearing lowers honor by 2; an unknown kind exits 1 with a JSON error`.
  - `extra arguments are rejected` for `quest progress extra` and `link check a b`.
  - `tampering with the dice blocks quest commands with exit 2`.
- [ ] **Step 2: Run** `node --test tests/game/cli.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the commands in the dispatch style of `game/cli.js`. Update `USAGE`. README: move the quest rows to Done as they land, add the commands to "Try what exists", add `player/` to the layout table.
- [ ] **Step 4: Run** `node --test` and a dash scan `grep -rnP '[\x{2013}\x{2014}]' game quests tests README.md`. Expected: all PASS, scan prints nothing.
- [ ] **Step 5: Real smoke test.** In a throwaway `JSDND_GAME_DB` and `JSDND_PLAYER_DIR`, run `quest start dice-roll`, write a solution, `quest check`, `quest judge ... clean`, and confirm honor and progress.
- [ ] **Step 6: Checkpoint.** Report changed files. No git.

---

## Left to the owner

- The full quest list and the fixed total number of quests, locations, and NPCs. Plan 3 only proves the loop with three quests.
- The real honor numbers. The defaults above are placeholders you can tune in one table.
- License and certificate stay open and do not block this plan.

## Self-review notes

- Spec coverage: 5.3 (curriculum ladder, dice quest) is covered by the starter quests; 5.5 steps 1 to 6 by Tasks 3 to 6; 5.6 honor, tone, and legal links by Tasks 1, 2, and 5. Curriculum beyond three quests and the Master's actual review wording are content for later.
- Type consistency: `questId`, `attemptId`, `saveId`, and `epoch` are camelCase in JS and snake_case in SQL throughout.
- Proportion: similar in size to the Plan 2 plan, with code only in test names, schema, and signatures.
