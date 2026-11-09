import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abilityMod, heroStats, ENEMY_TIERS, attackRoll, damageRoll, initiativeRoll } from '../../game/combat.js';
import { createSave } from '../../game/hero.js';
import { freshDb, count } from './helpers.js';

// An rng that makes a die of the given size land on `value`.
const face = (value, sides) => () => (value - 0.5) / sides;
const sequence = (...values) => {
  let i = 0;
  return () => values[i++];
};

const hero = {
  heroClass: 'fighter',
  abilities: {
    STR: { base: 8, traitAdjust: 0 },
    DEX: { base: 15, traitAdjust: 2 },
    CON: { base: 14, traitAdjust: 0 },
    INT: { base: 8, traitAdjust: 0 },
    WIS: { base: 8, traitAdjust: 0 },
    CHA: { base: 8, traitAdjust: 0 },
  },
};

const setup = () => {
  const db = freshDb();
  return { db, saveId: createSave(db, {}) };
};

test('abilityMod follows 5e at the boundaries', () => {
  const mods = [8, 9, 10, 11, 12, 20].map(abilityMod);
  assert.deepEqual(mods, [-1, -1, 0, 0, 1, 5]);
});

test('heroStats derives HP, AC, attack, and damage from abilities and applies modifiers', () => {
  assert.deepEqual(heroStats(hero), { maxHp: 12, ac: 13, attackBonus: 5, damageMod: 3 });
  assert.deepEqual(heroStats(hero, { attack: -2, ac: -1 }), { maxHp: 12, ac: 12, attackBonus: 3, damageMod: 3 });
});

test('enemy tiers have the agreed numbers', () => {
  assert.deepEqual(ENEMY_TIERS, {
    weak: { hp: 6, ac: 10, attack: 2, die: 4 },
    normal: { hp: 14, ac: 12, attack: 3, die: 6 },
    tough: { hp: 26, ac: 14, attack: 4, die: 8 },
  });
});

test('attackRoll: a natural 20 always hits, a natural 1 always misses, otherwise total vs AC', () => {
  const { db, saveId } = setup();
  const crit = attackRoll(db, saveId, 0, 99, face(20, 20));
  assert.deepEqual([crit.hit, crit.crit, crit.d20], [true, true, 20]);
  const fumble = attackRoll(db, saveId, 99, 1, face(1, 20));
  assert.deepEqual([fumble.hit, fumble.crit], [false, false]);
  assert.equal(attackRoll(db, saveId, 5, 15, face(10, 20)).hit, true);
  assert.equal(attackRoll(db, saveId, 5, 16, face(10, 20)).hit, false);
  assert.equal(attackRoll(db, saveId, 5, 15, face(10, 20)).total, 15);
});

test('damageRoll doubles the dice on a crit and never returns less than 1', () => {
  const { db, saveId } = setup();
  const normal = damageRoll(db, saveId, 8, 3, false, face(5, 8));
  assert.deepEqual([normal.rolls, normal.damage], [[5], 8]);
  const crit = damageRoll(db, saveId, 8, 3, true, sequence(4.5 / 8, 2.5 / 8));
  assert.deepEqual([crit.rolls, crit.damage], [[5, 3], 11]);
  assert.equal(damageRoll(db, saveId, 4, -5, false, face(1, 4)).damage, 1);
});

test('initiativeRoll adds the DEX modifier', () => {
  const { db, saveId } = setup();
  assert.equal(initiativeRoll(db, saveId, 3, face(10, 20)).total, 13);
});

test('every roll is logged as a dice_rolls row', () => {
  const { db, saveId } = setup();
  attackRoll(db, saveId, 0, 10, face(10, 20));
  damageRoll(db, saveId, 6, 0, false, face(3, 6));
  initiativeRoll(db, saveId, 0, face(10, 20));
  assert.equal(count(db, 'dice_rolls'), 3);
});
