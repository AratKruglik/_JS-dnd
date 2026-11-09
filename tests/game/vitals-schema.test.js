import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroStats } from '../../game/combat.js';
import { HIT_DICE, DEFAULT_HIT_DIE, hitDie, STANDARD_CLASSES } from '../../game/rules.js';
import { createSave, createHero } from '../../game/hero.js';
import { freshDb } from './helpers.js';

const heroWith = (heroClass, con) => ({
  heroClass,
  abilities: {
    STR: { base: 10, traitAdjust: 0 },
    DEX: { base: 10, traitAdjust: 0 },
    CON: { base: con, traitAdjust: 0 },
    INT: { base: 10, traitAdjust: 0 },
    WIS: { base: 10, traitAdjust: 0 },
    CHA: { base: 10, traitAdjust: 0 },
  },
});

test('every standard class has a hit die and the table matches the agreed values', () => {
  assert.deepEqual(HIT_DICE, {
    barbarian: 12,
    bard: 8,
    cleric: 8,
    druid: 8,
    fighter: 10,
    monk: 8,
    paladin: 10,
    ranger: 10,
    rogue: 8,
    sorcerer: 6,
    warlock: 8,
    wizard: 6,
  });
  assert.deepEqual(Object.keys(HIT_DICE).sort(), [...STANDARD_CLASSES].sort());
});

test('a custom or missing class gets the default hit die of 8', () => {
  assert.equal(DEFAULT_HIT_DIE, 8);
  assert.equal(hitDie('fighter'), 10);
  assert.equal(hitDie('space-pirate'), 8);
  assert.equal(hitDie(undefined), 8);
  assert.equal(hitDie('constructor'), 8);
  assert.equal(hitDie('__proto__'), 8);
});

test('max HP is the hit die plus the CON modifier, at least 1', () => {
  assert.equal(heroStats(heroWith('fighter', 14)).maxHp, 12);
  assert.equal(heroStats(heroWith('barbarian', 14)).maxHp, 14);
  assert.equal(heroStats(heroWith('wizard', 14)).maxHp, 8);
  assert.equal(heroStats(heroWith('space-pirate', 10)).maxHp, 8);
  assert.equal(heroStats(heroWith('wizard', 3)).maxHp, 2);
  assert.equal(heroStats(heroWith('wizard', 1)).maxHp, 1);
});

test('migration 13 gives a hero HP, gold, and a regeneration clock, and the save an inventory', () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  createHero(db, saveId, { name: 'Bilbo', race: 'halfling', heroClass: 'rogue' });
  const row = db.prepare('SELECT hp, gold, hp_updated_at FROM heroes WHERE save_id = ?').get(saveId);
  assert.deepEqual({ ...row }, { hp: null, gold: 0, hp_updated_at: null });
  const columns = db
    .prepare('PRAGMA table_info(inventory_items)')
    .all()
    .map((c) => c.name);
  for (const column of ['id', 'save_id', 'name', 'source', 'quest_id', 'fight_id', 'created_at', 'revoked_at'])
    assert.ok(columns.includes(column), column);
  assert.throws(() =>
    db.prepare("INSERT INTO inventory_items (save_id, source, created_at) VALUES (?, 'gift', 'now')").run(saveId),
  );
});
