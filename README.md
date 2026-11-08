# JS D&D

A D&D-style adventure you play in your terminal, with your own AI model as the Dungeon Master. Every quest is a real JavaScript task: you write code in a file, and that code has to behave a certain way for the story to move on.

Built for JS beginners who want to learn programming but are tired of gamified quizzes. Finish the campaign and you have solid JS fundamentals up to async: the event loop, timeouts, and fetch.

> **Status: early. The game is not playable yet.** What exists today is the project foundation: the design, the tracking setup, and the dev tooling. The game itself starts with Plan 2. See the [feature list](#feature-list) for what is done and what is not.

## How it will play

1. Clone the repo and run one setup script.
2. Start the game in a terminal with your AI model. Claude first, Gemini and others later.
3. Build a hero: pick a race and a class (custom ones allowed), name them, and spend trait points on abilities.
4. The Master offers a few setting versions, from medieval to cyberpunk to Mad Max to a book or film world. Pick one, customize it, or write your own.
5. The Master generates your world. The number of locations, NPCs, and quests is the same for everyone. The setting and the story flavor are yours alone.
6. Walk between locations, talk to NPCs, and take quests. Each quest names a file. You write the solution in it.
7. The game runs your code, then the Master reads it. Cheat and your honor drops. Be a jerk and NPCs avoid you and roast you.
8. Your stamina is your real 5 hour AI usage window. The more of it you burn, the more tired your hero gets.
9. Finish the campaign and a hidden stats page shows what you learned.

## Technologies

| Part               | Choice                     | Why                                                                                                                            |
| ------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Runtime            | Node.js                    | The player needs it anyway to run their own quest code. Built-in `node:sqlite` and `node:test` mean zero npm dependencies.     |
| Game database      | SQLite                     | Real SQL with joins, foreign keys, and recursive queries for the locations graph. Lives in a local file, no server to install. |
| Dev notes database | SQLite, gitignored         | Separate from the game DB. Stores task state between sessions for whoever builds the game.                                     |
| Setup              | One `setup.sh`             | Checks and installs what is needed. No Docker.                                                                                 |
| AI host            | Claude Code (first)        | Built-in choice prompts drive most turns. Gemini, Grok, and local models come later.                                           |
| Tracking           | GitHub Issues and Projects | Board "JS D&D" on this repo, driven through the `gh` CLI.                                                                      |
| Tests              | `node:test`                | No test framework to install.                                                                                                  |

Game state lives only in SQLite, reached through scripts, never in JSON or markdown files. That keeps token use low so a player gets more play out of one usage window.

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
| Dice tamper detection                         | 2     | Done    | A stored fingerprint of the dice file is checked before every command. A change resets you to level 1 in the same world and keeps your history. |
| Stamina bar from the real 5hr limit           | 6     | In progress | A project status line reads the real usage and stores it in the DB, with a game-time estimate as fallback. Built and tested, still needs one live check in a fresh Claude Code session. |
| Tiredness penalties                           | 6     | Done | None before 60% used, then attack and AC drop in steps. Near the end of the window the hero collapses and play stops until it resets. |
| Hidden ending stats page                      | 7     | Planned | Hours, defeated enemies, subjects learned, tasks solved, honor over time                                                                        |
| Gemini, Grok, local model support             | later | Planned | After Claude works                                                                                                                              |
| Open-source license                           | none  | Open    | Not chosen yet                                                                                                                                  |
| Completion certificate                        | none  | Parked  | Needs a link to some resource, decided later                                                                                                    |

Each plan has an epic issue on the board: [Plan 2](https://github.com/yamnyk/_JS-dnd/issues/1), [Plan 3](https://github.com/yamnyk/_JS-dnd/issues/2), [Plan 4](https://github.com/yamnyk/_JS-dnd/issues/3), [Plan 5](https://github.com/yamnyk/_JS-dnd/issues/4), [Plan 6](https://github.com/yamnyk/_JS-dnd/issues/5), [Plan 7](https://github.com/yamnyk/_JS-dnd/issues/6).

## Try what exists

You need Node.js with `node:sqlite` support (Node 25.8.1 is what this was built on).

```bash
bash setup.sh        # checks Node and node:sqlite, creates the game DB in data/
node --test          # runs the test suite
node dev/cli.js status
```

The game scripts the Master will use already work, and every answer is one line of JSON. They write to your local save, so to experiment before you play, point them at a throwaway save first (open a new terminal when you are done):

```bash
export JSDND_GAME_DB=$(mktemp -d)/game.db JSDND_PLAYER_DIR=$(mktemp -d)
node game/cli.js init
node game/cli.js hero create --name Bilbo --race hobbit --class rogue --scores 8,15,14,8,8,15
node game/cli.js roll 2d6 --context "goblin attack"
node game/cli.js honor add 10 help "helped the baker"
node game/cli.js fight start "shopkeeper warned twice"
node game/cli.js integrity check
```

The quest loop works too (use the same throwaway save). A quest names a file in `player/`, you write your solution there, and the game checks it:

```bash
node game/cli.js quest list
node game/cli.js quest start dice-roll      # writes player/dice-roll.js with a starter stub
node game/cli.js quest check dice-roll      # step 1: runs your file against the fixed check
node game/cli.js quest judge dice-roll clean "no cheating spotted"   # step 2: the Master's verdict
node game/cli.js link check https://developer.mozilla.org/en-US/docs/Web/JavaScript
node game/cli.js honor event swearing "cursed at the baker"
```

Combat needs a hero and a finished world, which `/play` sets up. After that the Master uses `npc warn`, `fight begin`, `fight attack`, `fight flee`, and, for spectacular moves, `move propose` and `move check`.

To play, open this folder in Claude Code and type `/play`. Claude becomes the Dungeon Master and walks you through making a hero, choosing a setting, and exploring a world made just for you. The scripts above are what it uses behind the scenes.

Don't edit `game/dice.js`. The game fingerprints it, and a changed or missing dice file resets your hero to level 1. (Developers who change it on purpose re-seal it with `node game/seal.js`.)

`node dev/cli.js board-config yamnyk 3` points the dev tooling at the GitHub board. The dev notes DB lives in `.dev/` and is not committed.

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
3. Quest engine
4. World and hero generation
5. Combat
6. Stamina bar
7. Ending stats page

Each session opens by reading the dev notes and the board, and closes by writing the current task state and likely next steps back to the dev notes DB.

## Contributing

The repo is public and meant to be open source. Read the design spec first. Items in it marked `[My guess]` or `[Unchecked]` are not decisions. No em-dash or en-dash characters anywhere in the repo.

## License

Not chosen yet.
