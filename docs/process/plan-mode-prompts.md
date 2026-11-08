# Plan-mode prompts

One paste-ready prompt per plan. Open Claude Code in this repo, enter plan mode, and paste the prompt for the plan you want to write. Plan 1 is already written and in progress.

Spec: `docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md`

## Plan 1: Foundation and tracking

```
Read docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md in full.
Run `node dev/cli.js status` and read the current state first.
Plan only this subsystem: Foundation and tracking, covering spec sections 6, 7, 8.
Follow the spec's [My call] / [My guess] / [Unchecked] markers: do not treat guesses as decisions, and verify anything marked [Unchecked] before relying on it.
Constraints: commit and push yourself with plain messages (never a co-author or Claude line, never force-push without asking), ask before other outward-facing actions, no em-dash or en-dash anywhere, deterministic work in scripts, game data only in SQLite through scripts.
Write the plan to docs/superpowers/plans/ using the writing-plans skill. Tell me anything the spec leaves open and ask before you assume it.
```

## Plan 2: Game DB and script layer

```
Read docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md in full.
Run `node dev/cli.js status` and read the current state first.
Plan only this subsystem: Game DB and script layer, covering spec sections 6, 5.7 (fight log), 5.8.
Follow the spec's [My call] / [My guess] / [Unchecked] markers: do not treat guesses as decisions, and verify anything marked [Unchecked] before relying on it.
Constraints: commit and push yourself with plain messages (never a co-author or Claude line, never force-push without asking), ask before other outward-facing actions, no em-dash or en-dash anywhere, deterministic work in scripts, game data only in SQLite through scripts.
Write the plan to docs/superpowers/plans/ using the writing-plans skill. Tell me anything the spec leaves open and ask before you assume it.
```

## Plan 3: Quest engine

```
Read docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md in full.
Run `node dev/cli.js status` and read the current state first.
Plan only this subsystem: Quest engine, covering spec sections 5.3, 5.5, 5.6.
Follow the spec's [My call] / [My guess] / [Unchecked] markers: do not treat guesses as decisions, and verify anything marked [Unchecked] before relying on it.
Constraints: commit and push yourself with plain messages (never a co-author or Claude line, never force-push without asking), ask before other outward-facing actions, no em-dash or en-dash anywhere, deterministic work in scripts, game data only in SQLite through scripts.
Write the plan to docs/superpowers/plans/ using the writing-plans skill. Tell me anything the spec leaves open and ask before you assume it.
```

## Plan 4: World and hero generation

```
Read docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md in full.
Run `node dev/cli.js status` and read the current state first.
Plan only this subsystem: World and hero generation, covering spec sections 5.1, 5.2, 5.4.
Follow the spec's [My call] / [My guess] / [Unchecked] markers: do not treat guesses as decisions, and verify anything marked [Unchecked] before relying on it.
Constraints: commit and push yourself with plain messages (never a co-author or Claude line, never force-push without asking), ask before other outward-facing actions, no em-dash or en-dash anywhere, deterministic work in scripts, game data only in SQLite through scripts.
Write the plan to docs/superpowers/plans/ using the writing-plans skill. Tell me anything the spec leaves open and ask before you assume it.
```

## Plan 5: Combat

```
Read docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md in full.
Run `node dev/cli.js status` and read the current state first.
Plan only this subsystem: Combat, covering spec section 5.7.
Follow the spec's [My call] / [My guess] / [Unchecked] markers: do not treat guesses as decisions, and verify anything marked [Unchecked] before relying on it.
Constraints: commit and push yourself with plain messages (never a co-author or Claude line, never force-push without asking), ask before other outward-facing actions, no em-dash or en-dash anywhere, deterministic work in scripts, game data only in SQLite through scripts.
Write the plan to docs/superpowers/plans/ using the writing-plans skill. Tell me anything the spec leaves open and ask before you assume it.
```

## Plan 6: Stamina bar

```
Read docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md in full.
Run `node dev/cli.js status` and read the current state first.
Plan only this subsystem: Stamina bar, covering spec sections 5.9, 8.
Follow the spec's [My call] / [My guess] / [Unchecked] markers: do not treat guesses as decisions, and verify anything marked [Unchecked] before relying on it.
Constraints: commit and push yourself with plain messages (never a co-author or Claude line, never force-push without asking), ask before other outward-facing actions, no em-dash or en-dash anywhere, deterministic work in scripts, game data only in SQLite through scripts.
Write the plan to docs/superpowers/plans/ using the writing-plans skill. Tell me anything the spec leaves open and ask before you assume it.
```

## Plan 7: Ending stats page

```
Read docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md in full.
Run `node dev/cli.js status` and read the current state first.
Plan only this subsystem: Ending stats page, covering spec section 5.10.
Follow the spec's [My call] / [My guess] / [Unchecked] markers: do not treat guesses as decisions, and verify anything marked [Unchecked] before relying on it.
Constraints: commit and push yourself with plain messages (never a co-author or Claude line, never force-push without asking), ask before other outward-facing actions, no em-dash or en-dash anywhere, deterministic work in scripts, game data only in SQLite through scripts.
Write the plan to docs/superpowers/plans/ using the writing-plans skill. Tell me anything the spec leaves open and ask before you assume it.
```

## Extra plan: Multi-language (English and Ukrainian)

Not one of the original seven. Paste this into plan mode. It is longer than the others on purpose: language touches almost every part of the game, so the prompt names what to inspect and what to ask before planning.

```
Read docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md in full, then docs/superpowers/specs/2026-11-08-curriculum-catalog.md. Run `node dev/cli.js status` and read the current state first.

GOAL
Add multi-language support. The game is English only today. Add Ukrainian. The player picks the language, and everything the player reads is in that language: the Master's narration, quest specs and style directions, check feedback, the stamina bar, the ending page, errors the player might see, and setup messages. I accept that Ukrainian costs players extra tokens. Do not trade quality for token savings, but do not waste tokens either.

PLAN ONLY THIS SUBSYSTEM: language support (English plus Ukrainian), designed so a third language later needs a new catalog and a banned-phrase list, and no engine changes.

WHAT EXISTS TODAY: INSPECT EACH OF THESE BEFORE PLANNING, AND TELL ME WHAT YOU FOUND
1. .claude/commands/play.md: the whole Master brief, in English. Decide how the Master gets the language and how its replies, onboarding questions, honor tone (gentle review, roast) and NPC voices follow it.
2. game/voice.js: BANNED_PHRASES is English only, and the whole-word matcher uses Latin-only boundaries `(?<![a-z0-9])`. Ukrainian text would pass it unchecked or match wrongly. The spec's anti-goal (sloppy AI language) applies per language and needs a Ukrainian list.
3. game/honor-rules.js (toneFor: gentle at 0 and above, roast below 0): the roast is savage and swears. Decide what that means in Ukrainian.
4. quests/*.js and quests/style.js: brief, stub comments, `expected` and `got` strings from the checks, the nine GENERAL_STYLE directions, plus the 51 planned templates in the curriculum catalog (spec, expected examples, style.specific). The player's JS code, identifiers, file names, and exported function names stay English.
5. game/rules.js: race and class names, and ALIASES ("hobbit", "magician") that players type. Players will type race and class names in Ukrainian. Canonical keys must stay stable.
6. game/cli.js, game/quests.js, game/combat-engine.js and others: error messages (JSON `error` fields the Master reads), plus text scripts produce for the player directly: the collapse line, the quest style problems from game/style-check.js, honor and fight log details.
7. Direct player-facing script output that no Master filters: game/stamina.js (renderBar: "STAMINA", "left", "resets in"), game/statusline.js, game/ending-page.js (every label, dates, `<html lang="en">`), setup.sh, README.md, CLAUDE.md.
8. game/links.js: the legal documentation list matches exact hosts. Ukrainian mirrors may exist (for example a uk subdomain of javascript.info, a /uk/ locale path on MDN). Verify each against the real sites before relying on it. A legal Ukrainian link must not cost honor.
9. World content the Master writes into the DB (setting, location names, NPC names, descriptions, voices): it must come out in the player's language, pass `voice lint`, and survive a language switch.
10. The data model: where the player's language lives (the game DB, per save, never a file), and what happens to already stored text when it changes.

CONSTRAINTS (all the project's standing rules, plus the language ones)
- Commit and push yourself with plain messages. Never a co-author or Claude line. Never force-push or rewrite pushed history without asking. Ask before other outward-facing actions.
- No em-dash and no en-dash anywhere, in Ukrainian text too. Ukrainian often uses a dash where English uses "is"; the plan must say how those sentences are written instead, and flag the cost.
- Ukrainian is written in Cyrillic only. Never Latin transliteration, anywhere: UI, tests, docs, comments.
- Deterministic work in scripts. Game state only in SQLite through scripts. Checks stay deterministic and language independent: language changes text, never behavior, expected values, or what passes.
- The game keeps zero npm dependencies. Use Node's built-in Intl (Intl.PluralRules supports Ukrainian one/few/many/other). Dev dependencies need my approval. Do not add an i18n library without asking.
- Machine-readable surfaces stay English and stable: CLI commands, JSON keys, DB columns, honor kinds, quest ids, error codes if you introduce them.
- The Master reads script JSON. Decide, with costs, which text is translated by scripts (a reviewed catalog, deterministic) and which is translated by the Master on the fly. Do not assume either.
- Follow the spec's [My call] / [My guess] / [Unchecked] markers. Do not treat guesses as decisions. Verify anything [Unchecked] and anything you state about Ukrainian technical terminology.
- Tests first for everything. At least: every key exists in every language with the same placeholders, no Latin letters inside Ukrainian strings except an allowlist of code identifiers and placeholders, no dash characters, correct plural forms for 1, 2, 5, 11, 12, 21, 22, 25, 100 and 101, the banned-phrase matcher works with Cyrillic, a missing key falls back to English in a way the tests can see, and a test that fails when new player-facing text bypasses the catalog (say how you enforce that).

ASK ME BEFORE ASSUMING: USE AskUserQuestion, ONE DECISION AT A TIME OR SMALL RELATED GROUPS, WITH YOUR RECOMMENDATION FIRST. DO NOT WRITE THE PLAN UNTIL THESE ARE ANSWERED:
1. When and how the language is chosen: first question of /play, stored per save, changeable later? What happens to stored world text, quest text already shown, and the ending page when it changes.
2. Who translates what: reviewed catalogs in the repo (scripts return the player's language), the Master translating from English source on the fly, or a split. Compare cost, determinism, and quality for quest specs, check messages, errors, and style directions.
3. The Master brief: one English play.md that says "reply in language X", per-language briefs, or a shared core plus a small per-language file. Compare tokens and risk of drift.
4. Which surfaces get translated: status bar, ending page, setup.sh, CLI errors, README and docs. Does a Ukrainian README exist?
5. Race and class names: Ukrainian display names with canonical English keys? Which aliases per language? Check how the Ukrainian D&D 5e community names them and tell me what you find.
6. The Ukrainian roast: same savage-and-swearing rule as English? Word choice boundaries? I am a native speaker and will review the list.
7. The Ukrainian banned-phrase list (calques and chatbot-isms). You draft it, I review it.
8. JavaScript terminology: closures, promises, callbacks and the rest. Ukrainian term, English term in parentheses, or English only? You propose a glossary, I approve it. Mark it [Unchecked] until I do.
9. Ukrainian documentation mirrors on the legal link list.
10. A player who types in one language and plays in another, and mixed-language answers to onboarding questions.
11. Developer-only text (the session-start greeting, dev notes, board tooling): stays English, correct?

PROCESS
- Read the real sources first (the files above, Node's Intl.PluralRules for uk, the actual Ukrainian doc mirrors). Do not freestyle from memory.
- Tell me anything the spec or the code leaves open. Separate confirmed facts from inference and label inference as inference.
- Write the plan to docs/superpowers/plans/ using the writing-plans skill: header, Global Constraints, Decisions (mine versus your calls), Review Focus with a test per line, tasks in test-first order with exact interfaces. Review Focus must cover at least: plural forms, Cyrillic and Latin mixing, banned-phrase boundaries with Cyrillic, a missing key at runtime, switching language mid-game with stored text, scripts that parse JSON text fields, and the stamina bar and ending page with Cyrillic text.
- End with the execution handoff question (subagent-driven or native) and your recommendation.
```

## Extra plan: Fix the deferred review findings

Every final review left Minors that the plans deferred. They are collected, with where each came from and a status, in `docs/process/deferred-findings.md`. Paste this into plan mode to turn them into a fix plan.

```
Read docs/process/deferred-findings.md in full, then docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md, docs/superpowers/specs/2026-11-08-curriculum-catalog.md, and docs/superpowers/plans/2026-11-08-multi-language.md (approved, not built yet). Run `node dev/cli.js status` and read the current state first.

GOAL
Fix the deferred review findings that are worth fixing, test first, in a few small plans-worth of tasks. The register has about 50 items from Plans 2 to 7. They were all graded Minor by the reviewers, and some of that grading was about the spec's silence, not about the effect on a player. Re-grade every item by what a reasonable player or the Master gets if it ships, then fix the ones that matter and say plainly which ones you leave and why.

PLAN ONLY THIS SUBSYSTEM: the deferred findings (register ids A1 to F2). The owner-call items (G1 to G4, and B10) are decisions for me, not bugs.

STEP 0: VERIFY BEFORE PLANNING
The register says "open" for most items, but code has moved since each review. For every item, read the current code and tests and confirm whether it is still true. Run a probe or a mutation test where a claim is about behavior (for example "two parallel `move check` calls both apply", "a passing attempt from before a reset can be judged after it", "a never-settling promise gives a vague error", "a location named L3 hijacks `go`"). Report each item as: still true (verified by running), still true (inference only, label it), or already fixed. Drop the fixed ones from the plan and update the register status in the plan.

STEP 1: RE-GRADE BY EFFECT
Sort what remains into Important (a player can be cheated, blocked, or lose or gain honor wrongly; state can be corrupted; the Master can be misled) and Minor (polish, test gaps, rare edge cases). Candidates I suspect deserve Important, but you decide from evidence: A7 (parallel calls double-apply), A5 (tamper path crashes if the DB cannot open), B5 (the ending can re-unlock without the Master being told), B9 (honor from a pre-reset attempt), B7 and C7 (quest commands ignore gating and hide the file path), D1 (a never-settling promise gives a vague error, and rungs 4 and 5 are about promises and timers), E1 (a flaky test fails about 1 run in 120 and one was seen again recently), B1 (`--quest` bypasses the warning gate).

CONSTRAINTS
- Commit and push yourself with plain messages. Never a co-author or Claude line. Never force-push or rewrite pushed history without asking. Ask before other outward-facing actions.
- No em-dash and no en-dash anywhere.
- Deterministic work in scripts. Game state only in SQLite through scripts. Every connection uses `openGameDb`.
- Zero npm runtime dependencies. Prettier and ESLint are dev dependencies already in place: `npm run lint` and `npm run format:check` must stay green. Never touch or format `game/dice.js`: it is fingerprinted.
- Tests first for every fix: write the test, watch it fail for the right reason, then fix, then run the whole suite. A fix without a test that failed first does not count. Prefer tests that fail when the production change is removed (name that change before writing the test).
- Machine-readable surfaces stay English and stable. A fix must not change CLI command names, JSON keys, DB column names, honor kinds, or quest ids, unless I approve it.
- The multi-language plan is approved but not built. Any new player-facing or Master-facing message you add is English for now, and the plan must say how each one will be keyed later, so the language work does not have to chase them.
- Migrations are append-only. Never edit an applied one.
- Keep each fix as small as the finding. No refactors for taste.

ASK ME BEFORE ASSUMING: USE AskUserQuestion, ONE DECISION AT A TIME OR SMALL RELATED GROUPS, WITH YOUR RECOMMENDATION FIRST. DO NOT WRITE THE PLAN UNTIL THESE ARE ANSWERED:
1. Order: before or after the multi-language plan, and before or after the 51-quest curriculum. List which findings must land before the curriculum (the ones the new quests depend on) and which can wait.
2. Scope: fix everything that is still true, only the ones you re-graded Important, or Important plus the cheap test gaps. Show me the counts for each choice.
3. Each owner call, one by one, with what it costs either way: G1 (a tamper reset wipes race bonuses, per spec 5.8), G2 (reading a legal doc drops the clean bonus from +8 to +5), G3 (player code is unsandboxed), G4 (the fingerprint covers only dice.js, not rolls.js or cli.js), and B10 (a solve cannot be revoked by a later cheated verdict).
4. A7, parallel calls: how strict should it be? Options include moving every state read inside the transaction, a per-save advisory lock, or refusing a second concurrent write with a clear error. Recommend one and say what each costs.
5. E1, the flaky tests: inject a seeded rng through an environment variable the test sets, restructure the tests to use the library with a scripted rng, or retry. Recommend one.
6. D1, never-settling promises: what should the player see, and should a check wait with a timeout and say which function never finished.
7. B6 and B7 (knockout deadlock and quest commands ignoring gating): should the scripts enforce that a quest can only start when its NPC is awake and the hero is in the right place, or stay permissive so the Master can always recover?
8. Anything you find while verifying that is not in the register: list it and ask whether it joins this plan.

PROCESS
- Read the real code and tests first. Do not trust the register's wording: it was written from reviewer reports.
- Separate confirmed facts from inference and label inference as inference. Never present a guess as evidence.
- Write the plan to docs/superpowers/plans/ using the writing-plans skill: header, Global Constraints, Decisions (mine versus your calls), Review Focus with a test per line, tasks grouped by area (atomicity and the DB, game rules, input validation, robustness, tests, docs), each task with exact interfaces and test names, test first.
- Review Focus must cover at least: two processes writing at once, a crash in the middle of a multi-row write, a tamper reset in the middle of a quest or a fight, a quest added after the ending was unlocked, a hostile or odd name (NBSP, zero-width, very long, a slot name), a bad option under a tamper, and the file path the player is told to edit.
- Update docs/process/deferred-findings.md statuses as part of the plan's last task, so the register stays the source of truth.
- End with the execution handoff question (subagent-driven or native) and your recommendation.
```
