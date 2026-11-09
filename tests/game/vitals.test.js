import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSave, createHeroFromChoices } from '../../game/hero.js';
import { setSetting, fillWorld, go } from '../../game/world.js';
import { beginFight, heroAttack, fleeFight, getFightState } from '../../game/combat-engine.js';
import { applyTamperReset } from '../../game/reset.js';
import { checkQuest, judgeQuest } from '../../game/quests.js';
import { REGEN_MS, REST_COST, readVitals, syncHp, healHero, restHero, addGold } from '../../game/vitals.js';
import { freshDb } from './helpers.js';
import { SETTING, goodWorld } from './world-fixtures.js';

const solutions = join(resolve(dirname(fileURLToPath(import.meta.url))), '..', 'quests', 'solutions');
const script = (...pairs) => {
  let i = 0;
  return () => {
    const [value, sides] = pairs[i++];
    return (value - 0.5) / sides;
  };
};
const heroFirst = () => script([15, 20], [10, 20]);

// A fighter with CON 14: 12 max HP.
function ready() {
  const db = freshDb();
  const saveId = createSave(db, {});
  createHeroFromChoices(db, saveId, {
    name: 'Bilbo',
    race: 'hobbit',
    heroClass: 'fighter',
    scores: [8, 15, 14, 8, 8, 15],
  });
  setSetting(db, saveId, SETTING);
  fillWorld(db, saveId, goodWorld());
  return { db, saveId };
}

// The hero misses and the normal enemy hits for 6: the hero is left at 6 of 12.
function hurt(db, saveId) {
  beginFight(db, saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: heroFirst() });
  heroAttack(db, saveId, { rng: script([3, 20], [15, 20], [6, 6]) });
}

const setHp = (db, saveId, hp, at) =>
  db.prepare('UPDATE heroes SET hp = ?, hp_updated_at = ? WHERE save_id = ?').run(hp, at, saveId);
const T0 = Date.UTC(2026, 10, 9, 12, 0, 0);
const iso = (ms) => new Date(ms).toISOString();

test('a new hero is at full health with no gold', () => {
  const { db, saveId } = ready();
  assert.deepEqual(readVitals(db, saveId), { hp: 12, maxHp: 12, gold: 0 });
  assert.equal(readVitals(db, saveId + 99), null);
});

test('damage from a fight stays after the fight, and the next fight starts from it', () => {
  const { db, saveId } = ready();
  hurt(db, saveId);
  assert.equal(readVitals(db, saveId).hp, 6);
  fleeFight(db, saveId);
  assert.equal(readVitals(db, saveId).hp, 6);
  const next = beginFight(db, saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'hero', rng: heroFirst() });
  assert.deepEqual([next.hero.hp, next.hero.hpMax], [6, 12]);
});

test('health regenerates one point per half hour, computed from the clock and capped at the maximum', () => {
  assert.equal(REGEN_MS, 30 * 60 * 1000);
  const { db, saveId } = ready();
  setHp(db, saveId, 5, iso(T0));
  assert.equal(readVitals(db, saveId, T0 + 29 * 60 * 1000).hp, 5);
  assert.equal(readVitals(db, saveId, T0 + 95 * 60 * 1000).hp, 8);
  assert.equal(readVitals(db, saveId, T0 + 10 * 3600 * 1000).hp, 12);
  assert.equal(db.prepare('SELECT hp FROM heroes WHERE save_id = ?').get(saveId).hp, 5, 'reading writes nothing');
});

test('syncing stores the regenerated health and keeps the leftover minutes on the clock', () => {
  const { db, saveId } = ready();
  setHp(db, saveId, 5, iso(T0));
  syncHp(db, saveId, T0 + 95 * 60 * 1000);
  const row = db.prepare('SELECT hp, hp_updated_at FROM heroes WHERE save_id = ?').get(saveId);
  assert.deepEqual({ ...row }, { hp: 8, hp_updated_at: iso(T0 + 90 * 60 * 1000) });
  assert.equal(readVitals(db, saveId, T0 + 120 * 60 * 1000).hp, 9);
});

test('health does not regenerate during an open fight, and the clock restarts when the fight ends', () => {
  const { db, saveId } = ready();
  hurt(db, saveId);
  assert.equal(readVitals(db, saveId, Date.now() + 10 * 3600 * 1000).hp, 6);
  fleeFight(db, saveId);
  assert.equal(readVitals(db, saveId, Date.now() + 29 * 60 * 1000).hp, 6);
  assert.equal(readVitals(db, saveId, Date.now() + 61 * 60 * 1000).hp, 8);
});

test('losing a fight wakes the hero at the start with full health', () => {
  const { db, saveId } = ready();
  go(db, saveId, 'L2');
  beginFight(db, saveId, {
    npcSlot: 'N2',
    tier: 'tough',
    aggressor: 'hero',
    rng: script([3, 20], [15, 20], [15, 20], [8, 8]),
  });
  const lost = heroAttack(db, saveId, { rng: script([2, 20], [15, 20], [8, 8]) });
  assert.equal(lost.status, 'lost');
  assert.equal(readVitals(db, saveId).hp, 12);
});

test('a tamper reset heals the hero fully', () => {
  const { db, saveId } = ready();
  hurt(db, saveId);
  applyTamperReset(db, saveId, { expected: 'a', found: 'b' });
  // The reset drops every base score to 8, so CON 8 gives a maximum of 9 for a fighter.
  const after = readVitals(db, saveId);
  assert.deepEqual([after.hp, after.maxHp], [9, 9]);
  assert.equal(db.prepare('SELECT hp FROM heroes WHERE save_id = ?').get(saveId).hp, 9);
});

test('healing adds points, never passes the maximum, and rejects nonsense amounts', () => {
  const { db, saveId } = ready();
  hurt(db, saveId);
  fleeFight(db, saveId);
  assert.equal(healHero(db, saveId, 3).hp, 9);
  assert.equal(healHero(db, saveId, 100).hp, 12);
  for (const bad of [0, -2, 1.5, NaN, '3', undefined])
    assert.throws(() => healHero(db, saveId, bad), /whole number/i, String(bad));
});

test('rest heals fully for gold, only at the start, only when hurt, and never during a fight', () => {
  const { db, saveId } = ready();
  assert.equal(REST_COST, 5);
  assert.throws(() => restHero(db, saveId), /full health/i);
  hurt(db, saveId);
  assert.throws(() => restHero(db, saveId), /fight/i);
  fleeFight(db, saveId);
  assert.throws(() => restHero(db, saveId), /5 gold/);
  addGold(db, saveId, 12);
  const rested = restHero(db, saveId);
  assert.deepEqual(rested, { hp: 12, maxHp: 12, gold: 7, cost: 5 });
  assert.throws(() => restHero(db, saveId), /full health/i);
  assert.equal(readVitals(db, saveId).gold, 7);
});

test('rest only works at the starting place', () => {
  const { db, saveId } = ready();
  hurt(db, saveId);
  fleeFight(db, saveId);
  addGold(db, saveId, 12);
  go(db, saveId, 'L2');
  assert.throws(() => restHero(db, saveId), /start/i);
  assert.equal(readVitals(db, saveId).gold, 12);
});

test('gold is a whole number of at least zero', () => {
  const { db, saveId } = ready();
  assert.equal(addGold(db, saveId, 10), 10);
  assert.equal(addGold(db, saveId, -4), 6);
  assert.equal(addGold(db, saveId, -100), 0);
  for (const bad of [1.5, NaN, '3', undefined]) assert.throws(() => addGold(db, saveId, bad), /whole number/i);
});

test('a clean quest solve heals a quarter of the maximum, at least one point', () => {
  const { db, saveId } = ready();
  hurt(db, saveId);
  fleeFight(db, saveId);
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-vitals-'));
  copyFileSync(join(solutions, 'dice-roll.reference.js'), join(playerDir, 'dice-roll.js'));
  assert.equal(checkQuest(db, saveId, 'dice-roll', { playerDir, timeoutMs: 15000 }).status, 'pass');
  judgeQuest(db, saveId, 'dice-roll', 'clean', null, { playerDir });
  assert.equal(readVitals(db, saveId).hp, 9);
});

test('a cheated verdict heals nothing', () => {
  const { db, saveId } = ready();
  hurt(db, saveId);
  fleeFight(db, saveId);
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-vitals-'));
  copyFileSync(join(solutions, 'dice-roll.reference.js'), join(playerDir, 'dice-roll.js'));
  checkQuest(db, saveId, 'dice-roll', { playerDir, timeoutMs: 15000 });
  judgeQuest(db, saveId, 'dice-roll', 'cheated', 'hardcoded', { playerDir });
  assert.equal(readVitals(db, saveId).hp, 6);
});

test('a heal during an open fight reaches the fight too, so the next hit and a flee keep it', () => {
  const { db, saveId } = ready();
  hurt(db, saveId);
  assert.equal(getFightState(db, saveId).hero.hp, 6);
  assert.equal(healHero(db, saveId, 3).hp, 9);
  assert.equal(getFightState(db, saveId).hero.hp, 9);
  fleeFight(db, saveId);
  assert.equal(readVitals(db, saveId).hp, 9);
});

test('a clean solve judged in the middle of a fight keeps its heal after the flee', () => {
  const { db, saveId } = ready();
  hurt(db, saveId);
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-vitals-'));
  copyFileSync(join(solutions, 'dice-roll.reference.js'), join(playerDir, 'dice-roll.js'));
  checkQuest(db, saveId, 'dice-roll', { playerDir, timeoutMs: 15000 });
  judgeQuest(db, saveId, 'dice-roll', 'clean', null, { playerDir });
  assert.equal(getFightState(db, saveId).hero.hp, 9);
  fleeFight(db, saveId);
  assert.equal(readVitals(db, saveId).hp, 9);
});
