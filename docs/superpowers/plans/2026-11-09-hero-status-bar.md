# Hero status bar, persistent HP, gold, and items

Goal: the bottom bar shows the hero (name, level, HP, gold, item count, location) on line one and the stamina bar on line two. This needs three things that do not exist yet: persistent HP, gold, and items.

Spec of record: `docs/superpowers/specs/2026-11-07-js-dnd-campaign-design.md`. Gold and items are not in it, so this plan extends it.

## Decided by Gogi

- Bar is two lines: hero line, then stamina line.
- HP is persistent. Max HP is the class hit die at level 1 plus the CON modifier.
- HP comes back four ways: full heal on wake-up, a heal on each solved quest, a `rest` command at a location, and slow regeneration by real time.
- Gold comes from solved quests. Items come from solved quests and from won fights. Items are names only, no effects. Minimal system: no shop.

## Not decided, my guesses (confirm or change before building)

- [My guess] Hit dice: barbarian d12, fighter, paladin, ranger d10, bard, cleric, druid, monk, rogue, warlock d8, sorcerer, wizard d6, custom class d8. Max HP is at least 1.
- [My guess] The old flat `10 + CON` max HP in `game/combat.js` is replaced by the new formula, so fights get tougher or easier by class.
- [My guess] Gold per solved quest is `complexity * 5`. A revoked solve takes it back.
- [My guess] A solved quest heals 25 percent of max HP (at least 1). `rest` heals fully, costs 5 gold, and works only at the start location. Regeneration is 1 HP per 30 real minutes, never during a fight.
- [My guess] Items are granted by a script as unnamed entries, and the Master names each one in the world voice with `item name <id> "<name>"`. A revoked solve removes its item. An unnamed item still counts in the bar.
- [My guess] The hero line is colored by HP like the stamina bar: green 100 to 60, yellow 59 to 40, red 39 to 0.

## Tasks (test first, commit and push each)

1. **Schema and rules.** Migration 13: `heroes.hp`, `heroes.gold`, `heroes.hp_updated_at`, table `inventory_items` (save_id, name, source, quest_id, fight_id, created_at, revoked_at). Hit die table in `game/rules.js`, `maxHp` in `game/combat.js` uses it. Hero creation sets HP to max. Existing heroes backfill to full HP and 0 gold.
2. **HP lifecycle.** A fight starts from current HP and writes it back when it ends. Wake-up and reset heal fully. Quest solve heals 25 percent. `rest` command with gold cost and location check. Lazy regeneration computed from `hp_updated_at`, never while a fight is open.
3. **Gold and items.** Solve grants gold and an item, a won fight grants an item, a revoke takes both back. `item list`, `item name`. Block `rest`, `item name` during a collapse like other play commands.
4. **The bar.** `game/statusline.js` prints two lines. Labels from the catalogs in both languages (plural for items in Ukrainian). If the hero or the new columns are missing, the bar falls back to the stamina line alone. No migrations run from the status line.
5. **Docs and Master brief.** `play.md` (rest, item naming, what the bar shows), README, CLAUDE.md, the Ukrainian review checklist, dev notes.
6. **Final review** by one fresh reviewer, fix pass, update the deferred register.

## Verification

Full suite, lint, format check, dash scan after every task. A throwaway save played through: solve a quest (gold, item, heal), win and lose a fight (HP carries, wake-up heals), `rest`, and the bar in English and Ukrainian.
