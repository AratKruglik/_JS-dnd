# Multi-language Implementation Plan (English and Ukrainian)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The player picks English or Ukrainian and everything they read follows it: the Master's narration, quest specs, style directions, check feedback, the stamina bar, the collapse line, the ending page, and setup messages.

**Architecture:** A small `t()` function over two reviewed catalogs (`game/locales/en.js`, `uk.js`) with plural forms from `Intl.PluralRules`. The language lives in the game DB per save. Check results become language neutral codes with params that the parent renders in the save's language. The Master's brief stays one English file, and a script returns the active language pack (glossary, roast boundaries, banned phrases, voice tips).

**Tech Stack:** Node.js built-ins only (`Intl`, `node:sqlite`, `node:test`), SQLite, plain shell for `setup.sh`.

**Spec:** `docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md` (anti-goal: sloppy AI language, applies per language) and `docs/superpowers/specs/2026-11-08-curriculum-catalog.md` (quest text fields). Prompt: "Extra plan: Multi-language" in `docs/process/plan-mode-prompts.md`. Approved plan: `/Users/yamnyk/.claude/plans/smooth-mixing-lake.md`.

## Global Constraints

- Commit and push after each task with plain messages. Never a Co-Authored-By or Claude line. Never force-push or rewrite pushed history without asking.
- No em-dash (U+2014) or en-dash (U+2013) anywhere, in Ukrainian text too. Build them with `String.fromCharCode` in tests. Ukrainian sentences that would use a dash for "is" use "це" or a colon.
- Ukrainian is Cyrillic only. Never Latin transliteration. Latin letters in `uk` strings are allowed only inside backticks, `{placeholders}`, and the glossary's bracketed English terms.
- Game state only in SQLite through scripts. The language is `saves.language`. Every connection uses `openGameDb`. Script output is one line of JSON, errors are JSON on stderr with exit 1, tamper exits 2.
- Zero npm runtime dependencies. No i18n library. Dev dependencies need Gogi's approval.
- Machine-readable surfaces stay English and stable: CLI commands, JSON keys, DB columns, honor kinds, quest ids, slots. Language changes text, never behavior, expected values, or what passes a check.
- English behavior stays byte identical when the language is `en` or empty. The existing 388 tests must pass untouched except where text moved.
- Run `npm run lint` and `npm run format:check` with every task. `game/dice.js` is never touched.
- Developer-only text stays English: session greeting, dev notes, board tooling, `CLAUDE.md`, plans, specs.

## Decisions

Owner decisions:
- Language is the first question of `/play`, stored per save, switchable later. A switch changes all new text. Stored world names, descriptions, and voices stay as written.
- Hybrid: catalogs for fixed content, the Master writes narration, NPC speech, and world content in the player's language and relays English script errors in its own words.
- One English `play.md` plus a language pack from `lang show`.
- Surfaces: stamina bar and collapse line, ending page, `setup.sh`, and a short `README.uk.md`.
- Ukrainian display names for races and classes with Ukrainian aliases over stable English keys.
- Ukrainian roast follows the same savage-and-swearing rule, Gogi reviews the pack.
- JS terms: Ukrainian term plus the English term in brackets at first use in each quest.
- `uk.javascript.info` joins the legal links.
- `setup.sh` asks the language once.
- The Master always answers in the save's language. The player may type in either.
- I draft the Ukrainian banned-phrase list, glossary, and roast pack. Gogi reviews them.

Calls made while planning (Gogi can reject any):
- Catalogs are flat dotted keys, `{name}` placeholders, plural entries `{ one, few, many, other }` chosen by `params.count`. A missing key falls back to English and reports through `setMissingHandler`. With `JSDND_I18N_STRICT=1` (tests set it) a missing key or placeholder throws. Players never crash on a missing key.
- Check results leave the child process as `{ status, code, params }`. The parent renders `expected`, `got`, and `message` in the save's language before storing the attempt. Call expressions like `rollDie(6, () => 0)` stay as written.
- Quest text moves to `quests/text/en.js` and `uk.js` keyed by quest id. Stub comments come from there. Quest code stays language independent.
- Style-check problems render from the rule id (the 7 rules in `eslint.player.config.js`) plus the formatting line. Unknown rules and parse errors keep ESLint's own English text.
- Voice lint checks the active language's banned list plus the English list, with `\p{L}\p{N}` boundaries and apostrophe normalization (`'`, `’`, `ʼ`).
- Race, class, and alias input accepts both languages whatever the save language is. The DB keeps the English key. Custom races stay as typed.
- `setup.sh` prompts only on a terminal. With no terminal it stays English and leaves the DB language empty so `/play` asks later. When the player answers, setup runs `lang set` after init so `/play` skips the question. Shell strings are paired blocks in the script.
- Sequencing: build this before the 51-quest curriculum, so those quests are written once with both languages and a review gate. This plan migrates only the 3 existing quests.

## Review Focus

1. Plural forms for hours and counts at 1, 2, 5, 11, 12, 21, 22, 25, 100, 101 (Tasks 1, 6).
2. Cyrillic and Latin mixing inside `uk` strings (Task 1 parity test, Task 5).
3. Banned-phrase boundaries with Cyrillic: whole words only, apostrophe variants (Task 2).
4. A missing key at runtime: fallback visible in tests, never a crash for the player (Task 1).
5. Switching language mid-game: stored world text untouched, old attempts keep their text, new text follows (Tasks 3, 5).
6. Machine fields: key sets identical between languages, nothing parses a translated string (Task 5 contract test).
7. Stamina bar and ending page with Cyrillic and escaping (Task 6).
8. `setup.sh` with no terminal, and `lang set` during a stamina collapse (Tasks 1, 7).

## Files

| Path | Responsibility |
|---|---|
| `game/i18n.js` | `t`, plural handling, fallback handler, strict mode, language get and set |
| `game/locales/en.js`, `uk.js` | Strings and the pack: glossary, roast, bannedPhrases, voiceTips, races, classes |
| `game/schema.js` | Migration 11: `saves.language` |
| `game/voice.js`, `game/world.js` | Unicode-aware lint per language |
| `game/rules.js`, `game/hero.js` | Display names, aliases, display fields |
| `quests/text/en.js`, `uk.js`, `quests/messages.js` | Quest text and check message codes |
| `quests/*.js`, `quests/run-check.js`, `quests/run-tests.js`, `game/child-check.js`, `game/quest-runner.js`, `game/move-runner.js`, `game/quests.js`, `game/moves.js` | Neutral results and rendering |
| `game/style-check.js` | Localized style problems |
| `game/stamina.js`, `game/statusline.js`, `game/cli.js` | Bar, collapse line, `lang` commands |
| `game/ending-page.js`, `game/ending.js` | Localized page |
| `setup.sh`, `game/links.js`, `README.uk.md`, `docs/i18n/uk-review-checklist.md`, `eslint.config.js` | Setup, links, docs, guard |
| `.claude/commands/play.md` | Language section |

## Task 1: Core and storage

**Files:**
- Create: `game/i18n.js`, `game/locales/en.js`, `game/locales/uk.js`
- Modify: `game/schema.js` (migration 11), `game/cli.js`
- Test: `tests/game/i18n.test.js`, `tests/game/locales.test.js`, `tests/game/cli.test.js`

**Interfaces:**
- Produces: `LANGUAGES = ['en', 'uk']`; `DEFAULT_LANGUAGE = 'en'`; `t(lang, key, params = {}) -> string` (a plural entry is `{ one, few, many, other }` chosen by `params.count` through `Intl.PluralRules(lang)`); `setMissingHandler(fn | null)`; `getLanguage(db, saveId) -> 'en' | 'uk' | null`; `setLanguage(db, saveId, lang)`; `effectiveLanguage(db, saveId)` (null gives `'en'`). CLI `lang show` returns `{ ok, language, effective, available }` and `lang set <en|uk>` returns `{ ok, language }`.

- [ ] **Step 1: Write the failing tests.** `t`: lookup, `{name}` placeholders, `uk` plurals for 1, 2, 5, 11, 12, 21, 22, 25, 100, 101, a missing `uk` key falls back to English and calls the handler, strict mode throws on a missing key and a missing placeholder, unknown language throws. DB: new save has `language` null, `setLanguage` round trips, bad code rejected, `effectiveLanguage` maps null to `en`. CLI: `lang show` and `lang set` work, reject extra arguments and bad codes, are not blocked by a stamina collapse, and are in the usage text. Parity tests in `locales.test.js`: every `en` key exists in `uk` and the reverse, same placeholders, `uk` plural entries have every category, no Latin letters in `uk` outside the allowed spots, no dash characters in either file.
- [ ] **Step 2: Run to see them fail.** Run: `node --test`. Expected: FAIL, modules missing.
- [ ] **Step 3: Implement** `game/i18n.js`, the two catalogs with an initial handful of keys, migration 11 (`ALTER TABLE saves ADD COLUMN language TEXT CHECK (language IN ('en', 'uk'))`), and the `lang` commands.
- [ ] **Step 4: Run the full suite, lint, and format check.** Expected: PASS.
- [ ] **Step 5: Commit and push.** `git commit -m "Add the i18n core and the per-save language"`.

## Task 2: Voice lint

**Files:**
- Modify: `game/voice.js`, `game/world.js`, `game/cli.js`, `game/locales/en.js`, `game/locales/uk.js`
- Test: `tests/game/voice.test.js`, `tests/game/world.test.js`, `tests/game/cli.test.js`

**Interfaces:**
- Consumes: `effectiveLanguage`, the pack's `bannedPhrases`.
- Produces: `lintVoice(text, lang = 'en') -> { ok, hits }`. `setSetting` and `fillWorld` pass the save's language. `voice lint` uses the save language.

- [ ] **Step 1: Write the failing tests.** English results are unchanged for the existing cases. A Ukrainian banned phrase is hit, in any case and with `'`, `’`, or `ʼ` apostrophes. A banned phrase inside a longer Cyrillic word is not hit (whole words only). English phrases are still caught in Ukrainian text. `world fill` and `world setting` reject a banned Ukrainian phrase with a readable error. `voice lint` follows `lang set`.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** the Unicode-aware matcher (`u` flag, `\p{L}\p{N}` boundaries) and the first Ukrainian banned-phrase draft (calques and chatbot-isms) in the `uk` pack.
- [ ] **Step 4: Run the full suite, lint, and format check.**
- [ ] **Step 5: Commit and push.** `git commit -m "Make the voice lint Unicode aware and add the Ukrainian banned phrases"`.

## Task 3: Language pack and Master brief

**Files:**
- Modify: `game/cli.js`, `game/locales/en.js`, `game/locales/uk.js`, `.claude/commands/play.md`
- Test: `tests/game/cli.test.js`, `tests/game/play-command.test.js`

**Interfaces:**
- Produces: `lang show` also returns `pack: { glossary: [{ term, english }], roast: { rule, fairGame, neverAllowed, tone }, bannedPhrases, voiceTips }` for the effective language. `play.md` has a Language section and Start step 1 asks for the language when `language` is null.

- [ ] **Step 1: Write the failing tests.** `lang show` pack shape in both languages and that the pack changes with `lang set`. `play.md` content: the language comes first at Start, ask when `language` is null and run `lang set`, speak only that language, never mix languages in one reply, code, identifiers, and commands stay English, quote script-provided quest text faithfully, relay English script errors in your own words, a switch keeps stored world text, use the glossary format (term then English in brackets at first use in each quest).
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** the pack in both catalogs (English pack carries the current roast rule and banned list) with the Ukrainian glossary, roast pack, and voice tips as drafts, and the `play.md` section.
- [ ] **Step 4: Run the full suite, lint, and format check.**
- [ ] **Step 5: Commit and push.** `git commit -m "Add the language pack and teach the Master about language"`.

## Task 4: Race and class names

**Files:**
- Modify: `game/rules.js`, `game/hero.js`, `game/cli.js`, `game/locales/en.js`, `game/locales/uk.js`
- Test: `tests/game/rules.test.js`, `tests/game/hero-create.test.js`, `tests/game/cli.test.js`

**Interfaces:**
- Consumes: `effectiveLanguage`, catalog `races` and `classes` tables (`{ key: { name, aliases } }`).
- Produces: the existing race and class resolver accepts display names and aliases from both languages and apostrophe variants, returning the English key. `rules races` and `rules classes` return `{ name, display, aliases }` per entry for the effective language. `hero show` adds `raceDisplay` and `classDisplay`.

- [ ] **Step 1: Write the failing tests.** A Ukrainian name and alias resolve to the English key, the DB stores the key, English typed in a Ukrainian game works, Ukrainian typed in an English game works, a custom race typed in Ukrainian stays as typed and still needs a description, apostrophe variants match, `rules races` shows display names and aliases per language, `hero show` carries display fields, keys and bonuses are identical in both languages.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** the tables (draft Ukrainian names seeded from the unofficial SRD translation, license checked first) and the resolver change.
- [ ] **Step 4: Run the full suite, lint, and format check.**
- [ ] **Step 5: Commit and push.** `git commit -m "Add Ukrainian race and class names over stable keys"`.

## Task 5: Quest text and check messages

**Files:**
- Create: `quests/text/en.js`, `quests/text/uk.js`, `quests/messages.js`
- Modify: `quests/dice-roll.js`, `quests/string-shout.js`, `quests/array-sum.js`, `quests/style.js`, `quests/run-check.js`, `quests/run-tests.js`, `game/child-check.js`, `game/quest-runner.js`, `game/move-runner.js`, `game/quests.js`, `game/moves.js`, `game/style-check.js`, `game/cli.js`
- Test: `tests/game/quests.test.js`, `tests/game/quest-style.test.js`, `tests/game/quest-runner.test.js`, `tests/game/move-runner.test.js`, `tests/quests/starter-quests.test.js`, `tests/game/cli.test.js`

**Interfaces:**
- Produces: `quests/messages.js` helpers (`missingExport(name, got)`, `wrongResult(call, wanted, gave)`, `custom(code, params)`) returning `{ pass: false, code, params }`. Child results carry `{ status, code, params }`. `renderResult(result, lang)` in `game/quests.js` fills `expected`, `got`, and `message` from the catalog. `startQuest` returns `title`, `brief`, and `style` in the save's language. `quest list` titles are localized. Stub comments come from `quests/text/*`. The 9 general style directions are catalog keys.

- [ ] **Step 1: Write the failing tests.** Every message code used by any check or runner exists in both languages with matching placeholders. English output for the existing quests is byte identical to today's (snapshot the current strings first). Ukrainian output for each code reads as the catalog says. Attempts store the rendered text in the language at the time. `quest start` stub comments and `brief` follow the language and never overwrite an existing player file. Style problems render per rule id in both languages, parse errors keep ESLint's text. Contract test: the JSON key sets of `quest list`, `quest start`, `quest check`, and `move check` are identical in both languages and quest ids are unchanged.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** the neutral results, the text catalogs for the 3 quests in both languages (Ukrainian as drafts), and the rendering.
- [ ] **Step 4: Run the full suite, lint, and format check.**
- [ ] **Step 5: Commit and push.** `git commit -m "Move quest text and check messages into the language catalogs"`.

## Task 6: Script-printed surfaces

**Files:**
- Modify: `game/stamina.js`, `game/statusline.js`, `game/cli.js`, `game/ending-page.js`, `game/ending.js`, `game/locales/en.js`, `game/locales/uk.js`
- Test: `tests/game/stamina.test.js`, `tests/game/statusline.test.js`, `tests/game/ending-page.test.js`, `tests/game/ending.test.js`, `tests/game/cli.test.js`

**Interfaces:**
- Produces: `renderBar(reading, nowMs, width, { color, lang })`. The collapse error text uses `t(lang, 'stamina.collapse', { location, count: hours })` with a plural for hours. `renderPage(stats, lang)` uses catalog labels, `Intl.DateTimeFormat(lang)` dates, and `<html lang>`. `buildEnding` reads the save language.

- [ ] **Step 1: Write the failing tests.** English bar and page output identical to today. Ukrainian bar uses catalog words and still has the right colors. The collapse line has the right plural for hours 1, 2, 5, 11, 21, 22. The status line reads the save language and falls back to English with no DB or no language. The Ukrainian page has a `lang="uk"` attribute, Ukrainian labels, formatted dates, no Latin leftovers outside the allowlist, no `NaN` or `undefined`, and hostile names are still escaped.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** the language parameter through these surfaces and the Ukrainian strings (drafts).
- [ ] **Step 4: Run the full suite, lint, and format check.**
- [ ] **Step 5: Commit and push.** `git commit -m "Localize the stamina bar, the collapse line, and the ending page"`.

## Task 7: setup.sh

**Files:**
- Modify: `setup.sh`
- Test: `tests/setup.test.js`

**Interfaces:**
- Produces: a language prompt (English or Ukrainian) shown only when stdin and stdout are terminals. Paired English and Ukrainian blocks for every setup message. After init, a chosen language is saved with `node game/cli.js lang set <code>`. With no terminal the script prints English and leaves the DB language null. An Intl check warns and falls back to English when the Node build lacks Ukrainian support.

- [ ] **Step 1: Write the failing tests.** With no terminal everything is English and the DB language stays null. With `JSDND_SETUP_LANG=uk` (a test hook that stands in for the prompt answer) every message is Ukrainian and the DB language is `uk`. Every English message has a Ukrainian pair and the placeholder or command text inside each pair matches. A missing Ukrainian ICU prints a warning and continues in English.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** the prompt, the paired messages, the `lang set` call, and the Intl check.
- [ ] **Step 4: Run the full suite, lint, and format check.**
- [ ] **Step 5: Commit and push.** `git commit -m "Ask the language once in setup.sh and localize its messages"`.

## Task 8: Links, docs, guard

**Files:**
- Create: `README.uk.md`, `docs/i18n/uk-review-checklist.md`
- Modify: `game/links.js`, `README.md`, `CLAUDE.md`, `eslint.config.js`
- Test: `tests/game/links.test.js`, `tests/license.test.js` (or a new docs test), `tests/style.test.js`

- [ ] **Step 1: Write the failing tests.** `uk.javascript.info` is legal, `javascript.info.evil.test` and `uk.javascript.info@evil.test` are not, a bare `uk.javascript.info/...` is read as https. `README.uk.md` exists, is Cyrillic prose, links to the English README, mentions the license, has no dash characters, and the English README links to it. The review checklist lists every `uk` pack area and catalog file. The ESLint guard flags a multiword English string literal in a listed player-facing file and passes the listed files today.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** the link entry, the two docs, the README and `CLAUDE.md` notes (language commands, catalogs, the review gate), and the guard (`no-restricted-syntax` on `Literal` and `TemplateElement` with two or more English words, limited to the player-facing modules). Known gap, written in the checklist: it catches prose, not single words, and CLI error text is out of scope by decision.
- [ ] **Step 4: Run the full suite, lint, and format check.** Dash scan: `grep -rnP '[\x{2013}\x{2014}]' game quests tests dev .claude docs README.md README.uk.md CLAUDE.md setup.sh` prints nothing.
- [ ] **Step 5: Commit and push.** `git commit -m "Add the Ukrainian link, the Ukrainian README, and the player-facing text guard"`.

## Needs Gogi's review as a native speaker

Marked draft until reviewed: the Ukrainian glossary, the roast pack, the banned-phrase list, race and class names, and every UI and quest string. `docs/i18n/uk-review-checklist.md` lists file and key for each.

## Open items

- [Unchecked] `uk.javascript.info` and the state of MDN's Ukrainian locale: re-verify against the live sites during Task 8.
- [Unchecked] The unofficial SRD translation's license before any term is copied: check during Task 4.
- Curriculum quests (51) come after this plan and carry `en` and `uk` text plus a review gate.
- A live `/play` run in Ukrainian, including a roast and a language switch, is Gogi's to do.
