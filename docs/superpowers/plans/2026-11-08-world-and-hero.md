# World and Hero Generation Implementation Plan (Plan 4 of 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player start the game with `/play`, build a validated D&D hero, pick or write a setting, and get a unique world: a fixed 6-location, 6-NPC skeleton in the repo that the Master reskins and the scripts store, validate, and let the hero walk through.

**Architecture:** Structure is deterministic and lives in the repo (skeleton, rules, point buy, banned phrases). Content is the Master's job and is stored through one atomic `world fill` call. Everything the Master touches goes through `game/cli.js`. The Master's instructions live in a project command, `.claude/commands/play.md`, so the developer `CLAUDE.md` and the game never clash.

**Tech Stack:** Node.js (`node:sqlite`, `node:test`), SQLite, Claude Code project commands.

**Spec:** `docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md` (sections 5.1, 5.2, 5.4). Builds on Plans 2 and 3: `game/db.js`, `game/hero.js`, `game/quests.js`, `game/cli.js`, `quests/index.js`.

## Global Constraints

- Em-dash (U+2014) and en-dash (U+2013) never appear anywhere: code, comments, tests, docs, output. Build the characters with `String.fromCharCode` in tests; the owner's editor hook rewrites literal ones.
- Commit and push after each finished task group with plain messages. Never a Co-Authored-By line or any Claude attribution. Never force-push or rewrite pushed history without asking.
- Ask the owner before other outward-facing actions.
- Game state lives only in SQLite reached through scripts. The skeleton, rules, and the `/play` command are repo content, not game state. No JSON or markdown files as game state.
- Every DB connection sets WAL, `synchronous=NORMAL`, `busy_timeout` first, and `foreign_keys=ON`; use `openGameDb` only.
- Counts of locations, NPCs, and quests are fixed for every player; the setting and story vary (spec 5.2).
- Race and class are separate picks; custom race or class is allowed and the Master asks questions to fill the gaps (spec 5.1).
- Choice prompts take 2 to 4 options each (spec 5.4, Unchecked); no location may have more than 4 exits.
- Script output is one line of compact JSON; errors are one line of JSON on stderr with exit 1; tamper exits 2.
- 5e point buy figures are from memory and are Unchecked: verify against the 5e SRD before they ship (Task 1).

## Decisions

Approved by the owner for this plan:
- Launch with a **`/play` project command** that holds the Master's instructions.
- The map is a **fixed skeleton in the repo** and the Master reskins it. Same learning path for everyone.
- MVP world size: **6 locations and 6 NPCs**.
- **5e point buy (27 points) plus race bonuses.** A custom race gets bonuses proposed by the Master, capped at the same total as standard races, and the player approves.

Calls made while planning (the owner can reject any):
- Standard races and classes are the 5e SRD names (from memory, Unchecked). Aliases: `hobbit` means `halfling`, `magician` means `wizard`. Half-elf gets CHA +2, DEX +1, CON +1 (5e lets the player choose; a fixed pick keeps it simple).
- A custom race bonus set: each value from -2 to +2 and the positives add up to at most 3. The script cannot know the player approved; asking is the Master's job. A custom class has no mechanical effect yet and is stored as a description.
- Ability storage reuses Plan 2: `base` is the point-buy score (8 to 15) and `trait_adjust` is the race bonus. A tamper reset already returns both to 8 and 0.
- `world fill` takes the whole world in one call as a JSON argument (an argument, not a file) so it is one tool call and one transaction. It is refused once any quest attempt exists, so names cannot change mid-game.
- Quests unlock in registry order: an NPC offers their quest only when every earlier quest is solved in the current epoch.
- NPCs 1, 2, and 3 hold the three starter quests (in registry order); NPCs 4, 5, and 6 are flavor and hint givers.
- Banned AI-speak is a list of multi-word phrases only, so ordinary fantasy words never trip it. `world fill` rejects text that contains one and says which, so the Master rewrites it.
- The existing `hero new` command from Plan 2 stays as a testing path; real onboarding uses the validated `hero create`.
- The dev SessionStart hook prints nothing when no dev DB exists, so a player's `/play` session is not littered with developer output.
- Paging for more than 4 exits is not built; a test pins the skeleton at 4 exits or fewer.

## Review Focus

1. Point buy and race bonuses: over budget, scores below 8 or above 15, the wrong number of scores, non-integers, and custom bonuses over the cap are all rejected and write nothing (Tasks 1, 2).
2. `world fill` is atomic: wrong counts, unknown slots, duplicate names, missing fields, and banned phrases are rejected and nothing is written; it is refused after the first quest attempt (Task 3).
3. Navigation: no moving along a non-existent exit, no unknown slots, nothing before the hero and a complete world exist, and no talking to an NPC who is not at the current location (Task 4).
4. Quest gating follows registry order and the current epoch, including after a tamper reset (Task 4).
5. The banned-phrase gate catches case and spacing variants and never flags ordinary fantasy prose, and `/play` only names commands that exist (Tasks 5, 7).

## Skeleton (content, lives in `world/skeleton.js`)

Locations (slot, role) and their exits; every location has 4 exits or fewer:
- `L1` starting hub: L2, L3, L4
- `L2` market: L1, L5
- `L3` outskirts: L1, L6
- `L4` ruin: L1, L5
- `L5` archive: L2, L4, L6
- `L6` stronghold: L3, L5

NPCs (slot, location, role): `N1` L1 mentor, quest 1; `N2` L2 trader, quest 2; `N3` L5 keeper, quest 3; `N4` L3 wanderer; `N5` L4 recluse; `N6` L6 captain. The hero starts at `L1`. Roles are setting-neutral; the Master turns them into a cyberpunk fixer, a wasteland scavenger, and so on.

## File Structure

| Path | Responsibility |
|---|---|
| `game/rules.js` | Races, classes, aliases, race bonuses, point buy, custom-bonus validation |
| `game/voice.js` | `BANNED_PHRASES`, `lintVoice` |
| `world/skeleton.js` | The fixed map, NPC placement, quest holders |
| `game/world.js` | Setting, `fillWorld`, `worldStatus`, `look`, `go`, `talk` |
| `game/hero.js` | Add `createHeroFromChoices` |
| `game/schema.js` | Migration 4 |
| `game/cli.js` | New `rules`, `hero create`, `world`, `look`, `go`, `talk`, `voice` commands |
| `dev/session-start.js` | Stay silent when no dev DB exists |
| `.claude/commands/play.md` | The Master's instructions |
| `CLAUDE.md` | Pointer: playing versus developing |

### Schema (migration 4)

- `ALTER TABLE heroes ADD COLUMN race_description TEXT`, `ADD COLUMN class_description TEXT`, `ADD COLUMN location_slot TEXT`
- `world_settings(id INTEGER PRIMARY KEY, save_id INTEGER NOT NULL UNIQUE REFERENCES saves(id), created_at TEXT NOT NULL, source TEXT NOT NULL CHECK (source IN ('offered','customized','written')), name TEXT NOT NULL, description TEXT NOT NULL, voice TEXT NOT NULL)`
- `world_locations(id INTEGER PRIMARY KEY, save_id INTEGER NOT NULL REFERENCES saves(id), slot TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, UNIQUE (save_id, slot), UNIQUE (save_id, name))`
- `world_npcs(id INTEGER PRIMARY KEY, save_id INTEGER NOT NULL REFERENCES saves(id), slot TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, voice TEXT NOT NULL, UNIQUE (save_id, slot), UNIQUE (save_id, name))`

---

### Task 1: Rules, point buy, and the banned-phrase list

**Files:**
- Create: `game/rules.js`, `game/voice.js`, `tests/game/rules.test.js`, `tests/game/voice.test.js`

**Interfaces:**
- Produces from `rules.js`: `STANDARD_RACES: Record<string, Partial<Record<Ability, number>>>` (5e SRD bonuses); `STANDARD_CLASSES: string[]`; `ALIASES: Record<string, string>`; `POINT_BUY_COSTS: Record<number, number>` (8 to 15 costing 0, 1, 2, 3, 4, 5, 7, 9); `POINT_BUY_BUDGET = 27`; `resolveName(kind: 'race' | 'class', name: string): { standard: boolean, name: string }`; `validatePointBuy(scores: number[]): { ok: boolean, spent: number, errors: string[] }` (six scores in ability order); `validateCustomBonuses(bonuses: Partial<Record<Ability, number>>): { ok: boolean, errors: string[] }`.
- Produces from `voice.js`: `BANNED_PHRASES: string[]` (multi-word AI-speak such as "as an ai", "i'd be happy to", "great question", "delve into", "it's important to note", "i hope this helps", "feel free to", "let me know if"); `lintVoice(text: string): { ok: boolean, hits: string[] }` (case and whitespace insensitive).

- [ ] **Step 1: Verify the 5e figures.** Check point buy costs, the 27 budget, the 8 to 15 range, and the nine race bonuses against the 5e SRD with a web check. Note the result in the ledger. Fix the table if memory was wrong.
- [ ] **Step 2: Write the failing tests:**
  - `a standard 27-point spread is valid`: `[15, 15, 15, 8, 8, 8]` spends exactly 27.
  - `over budget, out of range, wrong count, and non-integers are rejected with readable errors`: `[15, 15, 15, 15, 8, 8]`, `[16, 8, 8, 8, 8, 8]`, `[7, 8, 8, 8, 8, 8]`, five scores, seven scores, `[8.5, 8, 8, 8, 8, 8]`, and a string.
  - `under budget is valid` and reports `spent`.
  - `resolveName maps aliases and flags custom names`: `hobbit` gives `halfling`, `Magician` gives `wizard`, `Zorbian` is custom.
  - `every standard race bonus table sums to 3 or less in positives` (pins the cap used for custom races).
  - `custom bonuses: each within -2 to +2 and positives total at most 3`: accepts `{ STR: 2, DEX: 1, CON: -1 }`, rejects `{ STR: 3 }`, `{ STR: 2, DEX: 2 }`, an unknown ability, and a non-integer.
  - `lintVoice catches banned phrases in any case and spacing` and `lintVoice leaves ordinary fantasy prose alone` (a paragraph with tapestry, delve as a verb on its own, and certainly in dialogue).
- [ ] **Step 3: Run** `node --test tests/game/rules.test.js tests/game/voice.test.js`. Expected: FAIL.
- [ ] **Step 4: Implement** both modules.
- [ ] **Step 5: Run** the same command, then `node --test`. Expected: PASS, suite green.
- [ ] **Step 6: Commit and push** with a plain message.

---

### Task 2: Hero creation

**Files:**
- Modify: `game/schema.js` (migration 4, hero columns only for now), `game/hero.js`
- Create: `tests/game/hero-create.test.js`

**Interfaces:**
- Consumes: Task 1, `createHero`, `getHero` (Plan 2).
- Produces: `createHeroFromChoices(db, saveId: number, choice: { name: string, race: string, heroClass: string, scores: number[], bonuses?: Partial<Record<Ability, number>>, raceDescription?: string, classDescription?: string }): number`. Validates in this order and throws before writing: name non-empty, point buy, then for a standard race it takes the SRD bonuses and rejects supplied `bonuses`, for a custom race it requires `raceDescription` and valid `bonuses`, for a custom class it requires `classDescription`. Stores `base` from the scores, `trait_adjust` from the race bonuses, the descriptions, and `location_slot = 'L1'`. `getHero` also returns `raceDescription`, `classDescription`, and `locationSlot`.

- [ ] **Step 1: Write the failing tests:**
  - `a standard hero gets point-buy scores as base and race bonuses as trait_adjust`: halfling `[8, 15, 14, 8, 8, 15]` style spread stores DEX base 15 and trait_adjust 2.
  - `a custom race stores its description and approved bonuses`.
  - `a custom race without a description or with over-cap bonuses is rejected`.
  - `a standard race with supplied bonuses is rejected`.
  - `an invalid point buy writes nothing`: no hero row and no ability rows.
  - `a custom class requires a description`.
  - `the hero starts at L1`.
  - `a tamper reset returns abilities to 8 and 0 but keeps the descriptions and race` (Plan 2 behavior holds).
- [ ] **Step 2: Run** `node --test tests/game/hero-create.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** inside `inTransaction`.
- [ ] **Step 4: Run** the same command, then `node --test`. Expected: PASS, suite green.
- [ ] **Step 5: Commit and push.**

---

### Task 3: Skeleton, setting, and `fillWorld`

**Files:**
- Modify: `game/schema.js` (rest of migration 4)
- Create: `world/skeleton.js`, `game/world.js`, `tests/world/skeleton.test.js`, `tests/game/world.test.js`

**Interfaces:**
- Consumes: Tasks 1 and 2, `lintVoice`, `QUESTS`.
- Produces from `skeleton.js`: `SKELETON: { start: 'L1', locations: { slot, role, exits: string[] }[], npcs: { slot, location, role, questId?: string }[] }` as listed above.
- Produces from `world.js`: `setSetting(db, saveId, { source: 'offered' | 'customized' | 'written', name, description, voice }): void`; `fillWorld(db, saveId, data: { locations: Record<slot, { name, description }>, npcs: Record<slot, { name, description, voice }> }): { locations: number, npcs: number }`; `worldStatus(db, saveId): { settingSet: boolean, locationsFilled: number, locationsTotal: number, npcsFilled: number, npcsTotal: number, missing: string[], complete: boolean }`.

- [ ] **Step 1: Write the failing tests:**
  - Skeleton (`tests/world/skeleton.test.js`): `six locations and six npcs`, `the map is connected and exits are symmetric`, `no location has more than 4 exits`, `every npc location exists and every quest holder uses a real quest id in registry order`, `the start is L1`.
  - `setSetting stores the setting once per save and rejects an unknown source` and `rejects empty name, description, or voice`.
  - `fillWorld stores all 6 locations and 6 npcs in one call`.
  - `fillWorld is atomic: a missing slot, an unknown slot, a duplicate name, an empty field, or a banned phrase writes nothing`, each case checked for zero rows after the failure and for a readable error naming the problem.
  - `fillWorld is refused after the first quest attempt` and `fillWorld again before play replaces the world cleanly`.
  - `worldStatus reports missing pieces and complete only when setting, 6 locations, and 6 npcs exist`.
- [ ] **Step 2: Run** `node --test tests/world/skeleton.test.js tests/game/world.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** `fillWorld` runs in one transaction and replaces rows for the save.
- [ ] **Step 4: Run** the same command, then `node --test`. Expected: PASS, suite green.
- [ ] **Step 5: Commit and push.**

---

### Task 4: Navigation and quest gating

**Files:**
- Modify: `game/world.js`
- Create: `tests/game/navigation.test.js`

**Interfaces:**
- Consumes: Tasks 2 and 3, `getProgress` (Plan 3).
- Produces: `look(db, saveId): { location: { slot, name, description }, exits: { slot, name }[], npcs: { slot, name }[] }`; `go(db, saveId, target: string): { location: { slot, name } }` where `target` is an exit slot or an exit name (case-insensitive); `talk(db, saveId, npcSlot: string): { npc: { slot, name, description, voice }, offer: { questId: string, title: string, brief: string } | null }`. All throw clear errors when there is no hero, the world is incomplete, the target is not an exit, or the NPC is not at the current location. `offer` is the NPC's quest only when every earlier quest is solved in the current epoch and this quest is not solved yet; otherwise `null`.

- [ ] **Step 1: Write the failing tests:**
  - `look shows the current location with exits and the npcs there` at the start.
  - `go moves along an exit by slot or by name and rejects a non-exit, an unknown target, and a move before the world is complete`.
  - `look and go fail with a clear error when there is no hero`.
  - `talk rejects an npc who is not here`.
  - `the first quest is offered by N1 at the start`.
  - `the second quest is not offered until the first is solved` and `is offered after it`.
  - `a solved quest is no longer offered`.
  - `after a tamper reset gating starts over` (quest 1 offered again, quest 2 not).
  - `a flavor npc has no offer`.
- [ ] **Step 2: Run** `node --test tests/game/navigation.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Update `heroes.location_slot` on `go`.
- [ ] **Step 4: Run** the same command, then `node --test`. Expected: PASS, suite green.
- [ ] **Step 5: Commit and push.**

---

### Task 5: CLI commands

**Files:**
- Modify: `game/cli.js`, `tests/game/cli.test.js`

**Interfaces:**
- Consumes: Tasks 1 to 4.
- Produces commands (one line of JSON each; new commands reject extra arguments):
  - `rules races`, `rules classes`, `rules pointbuy`
  - `hero create --name <n> --race <r> --class <c> --scores <8 comma separated numbers or 6 numbers> [--bonuses STR=2,DEX=1] [--race-desc "<t>"] [--class-desc "<t>"]`
  - `world setting --source <offered|customized|written> --name <n> --desc <d> --voice <v>`
  - `world skeleton`, `world fill --data '<json>'`, `world status`
  - `look`, `go <exit>`, `talk <npcSlot>`
  - `voice lint "<text>"`
- Option parsing: generalize the Plan 2 value options so any `--name value` pair is accepted from a fixed allowed list per command; an unknown option still fails as JSON.

- [ ] **Step 1: Write the failing tests** (the temp-install helper from Plans 2 and 3):
  - `rules races lists the standard races with bonuses and the aliases`; `rules pointbuy prints costs and the budget`.
  - `hero create stores a valid hero and rejects an invalid spread with exit 1 and writes nothing`.
  - `a custom race round trip with bonuses and a description`.
  - `world setting, skeleton, fill, and status round trip until complete`.
  - `world fill rejects a banned phrase and names it`.
  - `look, go, and talk work end to end after fill, and go to a non-exit exits 1`.
  - `voice lint returns hits for AI-speak and ok for clean prose`.
  - `extra arguments and unknown options are rejected on the new commands`.
  - `the tamper gate still blocks the new commands with exit 2`.
  - `a negative number or dash-leading text inside --desc or --bonuses is accepted as a value`.
- [ ] **Step 2: Run** `node --test tests/game/cli.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the commands in the existing dispatch style and update `USAGE`.
- [ ] **Step 4: Run** the same command, then `node --test`. Expected: PASS, suite green.
- [ ] **Step 5: Commit and push.**

---

### Task 6: Quiet dev hook, `/play`, and CLAUDE.md

**Files:**
- Modify: `dev/session-start.js`, `tests/dev/session-start.test.js`, `CLAUDE.md`, `README.md`
- Create: `.claude/commands/play.md`, `tests/game/play-command.test.js`

**Interfaces:**
- Produces: the dev hook prints nothing and exits 0 when the dev DB file does not exist. `.claude/commands/play.md` is the Master's instructions. It covers, in order: how to tell a new game from a saved one (`world status`, `hero show`); onboarding (race and class through choice prompts using `rules races` and `rules classes`, custom race Q&A with a bonus proposal the player approves, point buy using `rules pointbuy`, naming, then `hero create`); setting offer (three versions as choice prompts, plus the customize or write-your-own path, then `world setting`); world generation (`world skeleton`, then one `world fill` call, rewriting if the banned-phrase gate rejects); the play loop (`look`, `go`, `talk`, the quest commands from Plan 3, `honor event`, `link use`, hints); tone by honor (`gentle` or `roast` from the quest check); the voice rules and a note that `voice lint` exists; and "never keep game state in files, always use the scripts". It also says the developer routine in `CLAUDE.md` does not apply during `/play`.

- [ ] **Step 1: Write the failing tests:**
  - `session-start prints nothing and exits 0 when the dev DB does not exist` (update the two existing fresh-DB tests to match: create the DB first where they need output).
  - `play.md exists, names every onboarding step in order, and never tells the Master to write state files`.
  - `every "node game/cli.js <command>" line in play.md names a command that exists in the CLI USAGE` (drift guard: spawn the CLI with no arguments, read USAGE from stderr, and compare the command words).
  - `CLAUDE.md points to /play for playing`.
  - `play.md contains no em-dash or en-dash`.
- [ ] **Step 2: Run** `node --test tests/dev/session-start.test.js tests/game/play-command.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Write `play.md` in plain imperative English for the Master. Add a short "Playing versus developing" section at the top of `CLAUDE.md`. Update the README feature rows and "Try what exists" for Plan 4.
- [ ] **Step 4: Run** `node --test` and a dash scan `grep -rnP '[\x{2013}\x{2014}]' game world dev tests .claude CLAUDE.md README.md`. Expected: all PASS, scan prints nothing.
- [ ] **Step 5: Real smoke test.** In a throwaway `JSDND_GAME_DB`, create a hero with a valid spread, set a setting, fill a world with sample names, then `look`, `go`, `talk N1`, and run the first quest end to end.
- [ ] **Step 6: Commit and push.**

---

## Left to the owner

- The exact banned-phrase list. The starter list is a guess you can edit in one file.
- How many setting versions the Master offers (the plan says three).
- NPC relations and richer lore tables are not built; the skeleton roles carry the MVP.
- The Master's voice quality can only be judged by playing. Plan 4 builds the framework and the gates, not the writing.
- Stamina effects (Plan 6) and combat (Plan 5) are not touched here.
- License and certificate stay open and do not block this plan.

## Self-review notes

- Spec coverage: 5.1 onboarding is covered by Tasks 1, 2, and 6; 5.2 world, fixed counts, and the voice framework by Tasks 3 and 5 and the banned list in Task 1; 5.4 choice prompts by the `/play` instructions and the 4-exit pin in Task 3. Curriculum beyond three quests and the level-up rules stay out.
- Type consistency: `saveId`, `slot`, `questId`, and `locationSlot` are camelCase in JS and snake_case in SQL throughout.
- Proportion: the plan is somewhat longer than Plan 3 because it spans three concerns, but code appears only as signatures, schema, and test names.
