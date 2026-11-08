import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { look, go, talk, setSetting, fillWorld } from '../../game/world.js';
import { createSave, createHeroFromChoices } from '../../game/hero.js';
import { checkQuest, judgeQuest } from '../../game/quests.js';
import { applyTamperReset } from '../../game/reset.js';
import { beginFight, heroAttack } from '../../game/combat-engine.js';
import { freshDb } from './helpers.js';
import { SETTING, goodWorld } from './world-fixtures.js';

const solutions = join(resolve(dirname(fileURLToPath(import.meta.url))), '..', 'quests', 'solutions');
const HERO = { name: 'Bilbo', race: 'hobbit', heroClass: 'rogue', scores: [8, 15, 14, 8, 8, 15] };

function ready({ hero = true, world = true } = {}) {
  const db = freshDb();
  const saveId = createSave(db, {});
  if (hero) createHeroFromChoices(db, saveId, HERO);
  if (world) {
    setSetting(db, saveId, SETTING);
    fillWorld(db, saveId, goodWorld());
  }
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-nav-'));
  const solve = (id) => {
    copyFileSync(join(solutions, `${id}.reference.js`), join(playerDir, `${id}.js`));
    checkQuest(db, saveId, id, { playerDir, timeoutMs: 15000 });
    return judgeQuest(db, saveId, id, 'clean', null, { playerDir });
  };
  return { db, saveId, solve };
}

test('look shows the current location with exits and the npcs there', () => {
  const { db, saveId } = ready();
  const view = look(db, saveId);
  assert.deepEqual(view.location, {
    slot: 'L1',
    name: 'Place 1',
    description: 'A dripping corner of the harbor, number 1.',
  });
  assert.deepEqual(view.exits, [
    { slot: 'L2', name: 'Place 2' },
    { slot: 'L3', name: 'Place 3' },
    { slot: 'L4', name: 'Place 4' },
  ]);
  assert.deepEqual(view.npcs, [{ slot: 'N1', name: 'Person 1' }]);
});

test('go moves along an exit by slot or by name', () => {
  const { db, saveId } = ready();
  assert.equal(go(db, saveId, 'L2').location.slot, 'L2');
  assert.equal(look(db, saveId).location.name, 'Place 2');
  assert.equal(go(db, saveId, 'place 1').location.slot, 'L1');
  assert.equal(go(db, saveId, 'PLACE 4').location.slot, 'L4');
});

test('go rejects a non-exit, an unknown target, and leaves the hero where they were', () => {
  const { db, saveId } = ready();
  assert.throws(() => go(db, saveId, 'L5'), /not an exit|cannot go/i);
  assert.throws(() => go(db, saveId, 'L9'), /not an exit|cannot go/i);
  assert.throws(() => go(db, saveId, 'nowhere'), /not an exit|cannot go/i);
  assert.throws(() => go(db, saveId, ''), /not an exit|cannot go|target/i);
  assert.equal(look(db, saveId).location.slot, 'L1');
});

test('nothing works before the world is complete', () => {
  const { db, saveId } = ready({ world: false });
  assert.throws(() => look(db, saveId), /not ready/i);
  assert.throws(() => go(db, saveId, 'L2'), /not ready/i);
  assert.throws(() => talk(db, saveId, 'N1'), /not ready/i);
});

test('look, go, and talk fail with a clear error when there is no hero', () => {
  const { db, saveId } = ready({ hero: false });
  assert.throws(() => look(db, saveId), /no hero/i);
  assert.throws(() => go(db, saveId, 'L2'), /no hero/i);
  assert.throws(() => talk(db, saveId, 'N1'), /no hero/i);
});

test('talk rejects an npc who is not at the current location', () => {
  const { db, saveId } = ready();
  assert.throws(() => talk(db, saveId, 'N2'), /not here/i);
  assert.throws(() => talk(db, saveId, 'N9'), /not here|unknown/i);
});

test('the first quest is offered by N1 at the start', () => {
  const { db, saveId } = ready();
  const result = talk(db, saveId, 'N1');
  assert.deepEqual(result.npc, {
    slot: 'N1',
    name: 'Person 1',
    description: 'A wary local, number 1.',
    voice: 'Mumbles, trails off, squints at everything.',
  });
  assert.equal(result.offer.questId, 'dice-roll');
  assert.ok(result.offer.title && result.offer.brief);
});

test('the second quest is not offered until the first is solved, then it is', () => {
  const { db, saveId, solve } = ready();
  go(db, saveId, 'L2');
  assert.equal(talk(db, saveId, 'N2').offer, null);
  go(db, saveId, 'L1');
  solve('dice-roll');
  go(db, saveId, 'L2');
  assert.equal(talk(db, saveId, 'N2').offer.questId, 'string-shout');
});

test('a solved quest is no longer offered', () => {
  const { db, saveId, solve } = ready();
  solve('dice-roll');
  assert.equal(talk(db, saveId, 'N1').offer, null);
});

test('after a tamper reset gating starts over', () => {
  const { db, saveId, solve } = ready();
  solve('dice-roll');
  applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' });
  assert.equal(talk(db, saveId, 'N1').offer.questId, 'dice-roll');
  go(db, saveId, 'L2');
  assert.equal(talk(db, saveId, 'N2').offer, null);
});

test('a flavor npc has no offer', () => {
  const { db, saveId } = ready();
  go(db, saveId, 'L3');
  const result = talk(db, saveId, 'N4');
  assert.equal(result.npc.slot, 'N4');
  assert.equal(result.offer, null);
});

test('slots are matched in any letter case', () => {
  const { db, saveId } = ready();
  assert.equal(talk(db, saveId, 'n1').npc.slot, 'N1');
  assert.equal(go(db, saveId, 'l2').location.slot, 'L2');
});

test('a knocked out npc talks again only after the hero solves a quest', () => {
  const { db, saveId, solve } = ready();
  beginFight(db, saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'hero', rng: () => 0.7 });
  while (db.prepare('SELECT 1 FROM fights WHERE ended_at IS NULL').get()) heroAttack(db, saveId, { rng: () => 0.95 });
  assert.throws(() => talk(db, saveId, 'N1'), /knocked out/i);
  solve('dice-roll');
  assert.equal(talk(db, saveId, 'N1').npc.slot, 'N1');
});

test('the stronghold shows both the captain and the final boss', () => {
  const { db, saveId } = ready();
  go(db, saveId, 'L3');
  go(db, saveId, 'L6');
  assert.deepEqual(
    look(db, saveId).npcs.map((n) => n.slot),
    ['N6', 'N7'],
  );
  assert.equal(talk(db, saveId, 'N7').offer, null);
});
