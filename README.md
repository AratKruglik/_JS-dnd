**English** | [Українська](README.uk.md)

# JS D&D

A D&D-style adventure you play in your terminal, with your own AI model as the Dungeon Master. Every quest is a real JavaScript task: you write code in a file, and that code has to behave a certain way for the story to move on.

Built for JS beginners who want to learn programming but are tired of gamified quizzes. Finish the campaign and you have solid JS fundamentals up to async: the event loop, timeouts, and fetch.

## How to play

**You need:** Node.js with `node:sqlite` support (Node 25.8.1 is what this was built on), and [Claude Code](https://claude.com/claude-code) with a Claude plan. The game is played inside Claude Code, which becomes your Dungeon Master.

1. Clone the repo and run `bash setup.sh` once. It checks Node, installs the code style tools with npm, asks once whether you want to play in English or Ukrainian, and creates your local save.
2. Open the folder in Claude Code and type `/play`.
3. Build your hero: pick a race and a class (custom ones allowed), name them, and spend your points on abilities.
4. The Master offers a few settings, from medieval to cyberpunk to Mad Max to a book or film world. Pick one, customize it, or write your own.
5. The Master builds your world. Everyone gets the same number of places, people, and quests. The setting and the story are yours alone.
6. Walk between places, talk to people, and take quests. Each quest names a file in the `player/` folder. You write your solution in it, in your own editor.
7. Tell the Master when it is ready. The game runs your code first. If it passes, the Master reads it. Cheat and your honor drops. Be a jerk and people avoid you and roast you. Fix or keep the style problems the game points out.
8. The bar at the bottom shows your hero (name, level, health, gold, items, and place) above their stamina. Stamina is your real 5 hour AI usage window. Past 60 percent your hero tires, and near the end they collapse until the window resets.
9. Beat every quest, then the final boss, and a page of your whole journey is built for you.

The Master speaks the language you picked. To switch later, tell the Master in `/play`.

Health carries between fights and comes back slowly over real time, fully when you wake after a lost fight, partly with every clean solve, and fully with a rest at the start for a little gold. Clean solves pay gold, and every clean solve and won fight gives your hero an item the Master names. Items are keepsakes for now, with no effects.

Honor is your reputation. Kind words, honest solves, and helping people raise it. Cheating, swearing, and picking fights lower it, and low honor gets you roasted instead of reviewed gently.

Never edit `game/dice.js` or `game/rolls.js`. The game fingerprints both, and a changed or missing file resets your hero to level 1. The dice code is meant to be read, so open it and write your own copy elsewhere if you want to experiment.

## Tech stack

| Part               | Choice                     | Why                                                                                                                            |
| ------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Runtime            | Node.js                    | The player needs it anyway to run their own quest code. Built-in `node:sqlite` and `node:test` mean the game itself has zero npm dependencies.     |
| Game database      | SQLite                     | Real SQL with joins, foreign keys, and recursive queries for the locations graph. Lives in a local file, no server to install. |
| Dev notes database | SQLite, gitignored         | Separate from the game DB. Stores task state between sessions for whoever builds the game.                                     |
| Setup              | One `setup.sh`             | Checks and installs what is needed. No Docker.                                                                                 |
| AI host            | Claude Code (first)        | Built-in choice prompts drive most turns. Gemini, Grok, and local models come later.                                           |
| Tracking           | GitHub Issues and Projects | Board "JS D&D" on this repo, driven through the `gh` CLI.                                                                      |
| Tests              | `node:test`                | No test framework to install.                                                                                                  |
| Code style         | Prettier and ESLint        | Dev dependencies, installed by `setup.sh`. They check this repo and the style of the player's quest files. The game plays without them. |

Game state lives only in SQLite, reached through scripts, never in JSON or markdown files. That keeps token use low so a player gets more play out of one usage window.

## Project status

Everything from here down is for people building the game.

**Status: all seven build plans are done and tested, but no one has played a full campaign yet.** The engine, hero, world, quests, combat, stamina bar, and ending are built. Only three starter quests exist, so the curriculum up to async is still content to write, and the live checks (a real `/play` run and the stamina bar in a fresh Claude Code session) are still open. See the [feature list](#feature-list) for what is done and what is not.

## Feature list

Legend: **Done** is built and tested. **In progress** is partly built. **Planned** has a design and a place in the roadmap but no code. **Open** needs a decision. **Parked** is wanted but deliberately postponed.

### Foundation (Plan 1)

| Feature                  | Status      | Notes                                                                                    |
| ------------------------ | ----------- | ---------------------------------------------------------------------------------------- |
| Design spec              | Done        | `docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md`                            |
| Dev notes SQLite DB      | Done        | WAL, foreign keys, busy timeout on every connection                                      |
| Notes API and CLI        | Done        | `node dev/cli.js task`, `note`, `status`, `board-config`                                 |
| Session start greeting   | In progress | Built and tested. Still needs one live check in a fresh Claude Code session (`/hooks`).  |
| Session end routine      | Done        | A rule in `CLAUDE.md`, not an automatic hook                                             |
| GitHub board and backlog | Done        | Project 3, issues 1 to 13, re-runnable seeding script                                    |
| Setup script             | In progress | Checks Node and `node:sqlite`. Does not install Node yet. How it should install is open. |
| Plan-mode prompts        | Done        | `docs/process/plan-mode-prompts.md`                                                      |

### The game

| Feature                                       | Plan  | Status  | Notes                                                                                                                                           |
| --------------------------------------------- | ----- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Game DB schema and script layer               | 2     | Done    | One hero and one world per install, with a save id so more can come later. Reached only through `node game/cli.js`.                             |
| Dice as a script                              | 2     | Done    | `game/dice.js`, player-readable, `Math.random`. The `dice-roll` quest teaches it.                                          |
| Fight log in the DB                           | 2     | Done    | Every fight step is logged by a script, with ordered steps and linked dice rolls                                                                |
| Fixed quest checks                            | 3     | Done    | Checks live in the repo. The Master only reskins the story. Three starter quests so far.                                                                                     |
| Step 1 runner (run the file, compare output)  | 3     | Done    | Plain script in a child process with a timeout, no AI. Generated inputs defeat hardcoded answers.                                                                                                                             |
| Step 2 judging (read the code for cheating)   | 3     | Done    | The Master reports clean or cheated and `quest judge` records it. The only judging that costs tokens.                                                                                                              |
| Honor and reputation                          | 3     | Done    | Red Dead Redemption 2 style, logged as timestamped events. Default deltas live in one table (`game/honor-rules.js`).                                                                                       |
| Gentle review or roasting by honor level      | 3     | Done    | Starts only after step 1 passes. Roasting below honor 0, gentle at 0 and above.                                                                                                                 |
| Curriculum from strings to async              | 3     | In progress | Three rung 1 starter quests exist. The rest is content for later. Ordering is a guess for now.                                                                                                                     |
| Hero creation with race, class, and point buy | 4     | Done    | 5e point buy (27 points) plus race bonuses, checked against public 5e sources. Custom race or class allowed with a description.                                                                                                     |
| Setting choice and world generation           | 4     | Done    | A fixed skeleton of 6 locations and 7 NPCs (one is the final boss) lives in the repo. The Master only fills in names, descriptions, and voices.                                                                                                          |
| Master voice per setting                      | 4     | In progress | A banned AI-speak list is enforced when the Master saves the world. Whether the writing actually sounds right can only be judged by playing.                                                                                           |
| Choice-prompt play UI                         | 4     | Done    | The /play command drives Claude choice prompts. Every location has 4 exits or fewer, so no paging is needed. Claude specific.                                                                   |
| D&D combat                                    | 5     | Done    | A simple D&D core: initiative, HP, AC, attack and damage rolled by script. NPCs warn twice before they fight (warnings clear when a fight ends), quest fights need no warning, a beaten NPC is knocked out until you solve another quest, and defeat means waking at the start.                                                                                                |
| JS moves in combat                            | 5     | Done    | A spectacular move triggers a JS problem the Master writes. A script rejects any problem whose own reference solution fails. A pass is a sure hit with double damage, a fail loses the turn. A subagent writes the hidden tests so you never see them, and the Master reads your move file for cheating.                                                                                 |
| Code style check on quest files | 3 | Done | Prettier and ESLint run on a passing quest file. Problems are shown with their lines, the player may fix them or keep the file and lose a little honor. Needs `npm install`, which `setup.sh` runs, and is skipped when the tools are missing. |
| Dice tamper detection                         | 2     | Done    | A stored fingerprint of the dice and rolls files is checked before every command. A change, a deletion, or a broken file resets you to level 1 in the same world, keeps your race bonuses, and keeps your history. |
| Stamina bar from the real 5hr limit           | 6     | In progress | A project status line reads the real usage and stores it in the DB, with a game-time estimate as fallback. Built and tested, still needs one live check in a fresh Claude Code session. |
| Hero line and vitals                          | none  | Done | Persistent health (class hit die plus CON), slow regeneration, gold from clean solves, unnamed items the Master names, and a rest. The bottom bar shows the hero line above the stamina bar. Gold has no use but rest, and items have no effects yet. |
| Tiredness penalties                           | 6     | Done | None before 60% used, then attack and AC drop in steps. Near the end of the window the hero collapses and play stops until it resets. |
| Hidden ending stats page                      | 7     | Done | A final boss guards it. After every quest and the boss, a script builds one self-contained page with time played (estimated), enemies defeated, tasks solved, and honor and complexity charts. Subjects learned is not built, and nobody has played from a fresh hero to the ending yet. |
| Gemini, Grok, local model support             | later | Planned | After Claude works                                                                                                                              |
| Open-source license                           | none  | Done    | MIT                                                                                                                                             |
| Completion certificate                        | none  | Parked  | Needs a link to some resource, decided later                                                                                                    |

Each plan has an epic issue on the board: [Plan 2](https://github.com/yamnyk/_JS-dnd/issues/1), [Plan 3](https://github.com/yamnyk/_JS-dnd/issues/2), [Plan 4](https://github.com/yamnyk/_JS-dnd/issues/3), [Plan 5](https://github.com/yamnyk/_JS-dnd/issues/4), [Plan 6](https://github.com/yamnyk/_JS-dnd/issues/5), [Plan 7](https://github.com/yamnyk/_JS-dnd/issues/6).

## Try the scripts

```bash
bash setup.sh        # checks Node and node:sqlite, creates the game DB in data/
bash play.sh         # starts Claude Code on Sonnet and runs /play
node --test          # runs the test suite
npm run lint         # ESLint
npm run format       # Prettier, writes the fixes
node dev/cli.js status
```

The game scripts the Master will use already work, and every answer is one line of JSON. They write to your local save, so to experiment before you play, point them at a throwaway save first (open a new terminal when you are done):

```bash
export JSDND_GAME_DB=$(mktemp -d)/game.db JSDND_PLAYER_DIR=$(mktemp -d)
node game/cli.js init
node game/cli.js hero create --name Bilbo --race hobbit --class rogue --scores 8,15,14,8,8,15
node game/cli.js roll 2d6 --context "goblin attack"
node game/cli.js honor add 10 help "helped the baker"
node game/cli.js integrity check
```

The quest and combat commands need a hero and a finished world, which `/play` builds. To try them on a throwaway save, start Claude Code from the terminal where you ran the `export` line above and run `/play`: the Master's scripts then use that save. These are the quest commands it runs:

```bash
node game/cli.js quest list
node game/cli.js quest start dice-roll      # writes dice-roll.js into the player folder with a starter stub
node game/cli.js quest check dice-roll      # step 1: runs your file against the fixed check
node game/cli.js quest judge dice-roll clean "no cheating spotted"   # step 2: the Master's verdict
node game/cli.js link check https://developer.mozilla.org/en-US/docs/Web/JavaScript
node game/cli.js rest                       # a full heal for 5 gold, at the start, when hurt
node game/cli.js item list                  # items the hero carries
node game/cli.js item name 1 "Rusty Lucky Die"   # the Master names an item, once
node game/cli.js honor event swearing "cursed at the baker"
```

Combat needs a hero and a finished world, which `/play` sets up. After that the Master runs a fight like this:

```bash
node game/cli.js npc warn N1 "stood behind the counter"           # the first two warnings are only warnings
node game/cli.js fight begin --npc N1 --tier weak --aggressor hero
node game/cli.js fight attack                                      # one hero turn, then the enemy answers
node game/cli.js fight flee                                        # or run
```

For spectacular moves it also uses `move propose` and `move check`.

Developers who change a sealed file on purpose (`game/dice.js` or `game/rolls.js`) re-seal it with `node game/seal.js`.

`node dev/cli.js board-config yamnyk 3` points the dev tooling at the GitHub board. The dev notes DB lives in `.dev/` and is not committed.

## Languages

The game is played in English or Ukrainian. The language belongs to the save: `setup.sh` asks once, the Master asks if it is still empty, and it can be switched at any time. Scripts return quest text and check messages already in the save language.

```bash
node game/cli.js lang show        # the language and its pack (glossary, roast rules, banned phrases, voice tips)
node game/cli.js lang set uk      # or en
```

- `game/locales/en.js` and `game/locales/uk.js` hold every UI string (flat dotted keys, `{placeholders}`, plural entries), the language pack, and the race and class names.
- `quests/text/en.js` and `quests/text/uk.js` hold the quest briefs, starter files, and style directions. A quest file itself carries only its id, rung, complexity, and check.
- The Master's brief `.claude/skills/play/` stays English and tells it to follow the pack.
- Code, file names, and commands stay English in every language. Developer text stays English.
- The Ukrainian text is a draft until a native speaker has reviewed it. `docs/i18n/uk-review-checklist.md` lists every file and key to read. New or changed Ukrainian text goes through the same gate.
- An ESLint rule (`no-restricted-syntax`, listed modules in `eslint.config.js`) rejects multiword English prose in the player-facing modules, so new words go into the catalogs.

## Repo layout

| Path                      | What it is                                                                       |
| ------------------------- | -------------------------------------------------------------------------------- |
| `docs/superpowers/specs/` | The design spec                                                                  |
| `docs/superpowers/plans/` | Implementation plans, one per subsystem                                          |
| `docs/process/`           | Paste-ready plan-mode prompts for each plan                                      |
| `game/`                   | The game's data layer: DB, dice, honor, fights, tamper check, and the script CLI |
| `data/`                   | The local game DB (gitignored, created by `setup.sh`)                            |
| `quests/`                 | The fixed quests: briefs, starter stubs, and checks                              |
| `world/` | The fixed world skeleton: 6 locations, 7 NPCs, and how they connect |
| `.claude/commands/` | `/play`: the Dungeon Master instructions |
| `player/`                 | Your quest solutions (gitignored, created when you start a quest)                |
| `dev/`                    | Dev tooling: notes DB, CLI, board reader, session start hook                     |
| `dev/github/`             | Script that seeds labels, the board, and issues                                  |
| `tests/`                  | `node:test` suites                                                               |
| `setup.sh`                | Player-facing setup script                                                       |
| `CLAUDE.md`               | Rules and session routine for Claude Code                                        |

## How it gets built

The work is split into seven plans, each producing something testable on its own:

1. Foundation and tracking (done)
2. Game DB and script layer (done)
3. Quest engine (done)
4. World and hero generation (done)
5. Combat (done)
6. Stamina bar (done, live check open)
7. Ending stats page (done)

Each session opens by reading the dev notes and the board, and closes by writing the current task state and likely next steps back to the dev notes DB.

## Contributing

The repo is public and meant to be open source. Read the design spec first. Items in it marked `[My guess]` or `[Unchecked]` are not decisions. No em-dash or en-dash characters anywhere in the repo.

## License

MIT. See the `LICENSE` file.
