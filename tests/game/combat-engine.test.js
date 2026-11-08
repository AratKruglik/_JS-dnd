import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warnNpc, beginFight, heroAttack, fleeFight, getFightState, loseHeroTurn } from '../../game/combat-engine.js';
import { createSave, createHeroFromChoices } from '../../game/hero.js';
import { setSetting, fillWorld, look, go, talk } from '../../game/world.js';
import { getFightLog } from '../../game/fights.js';
import { getHonor } from '../../game/honor.js';
import { applyTamperReset } from '../../game/reset.js';
import { freshDb, count } from './helpers.js';
import { SETTING, goodWorld } from './world-fixtures.js';

// Scripts an rng: each [value, sides] pair becomes the random number that lands on that face.
const script = (...pairs) => {
  let i = 0;
  return () => {
    const [value, sides] = pairs[i++];
    return (value - 0.5) / sides;
  };
};

// Hero: halfling, DEX 17 (+3), CON 14 (+2) -> 12 HP, AC 13, attack +5, damage 1d8+3.
const HERO = { name: 'Bilbo', race: 'hobbit', heroClass: 'rogue', scores: [8, 15, 14, 8, 8, 15] };

function ready({ hero = true, world = true } = {}) {
  const db = freshDb();
  const saveId = createSave(db, {});
  if (hero) createHeroFromChoices(db, saveId, HERO);
  if (world) {
    setSetting(db, saveId, SETTING);
    fillWorld(db, saveId, goodWorld());
  }
  return { db, saveId };
}

const heroFirst = () => script([15, 20], [10, 20]);

test('warnNpc counts per npc and per save, and allows a fight from the third warning', () => {
  const { db, saveId } = ready();
  assert.deepEqual(warnNpc(db, saveId, 'N1', 'behind the counter'), { warnings: 1, mayFight: false });
  assert.deepEqual(warnNpc(db, saveId, 'N1', 'again'), { warnings: 2, mayFight: false });
  assert.deepEqual(warnNpc(db, saveId, 'N1', 'still'), { warnings: 3, mayFight: true });
  assert.deepEqual(warnNpc(db, saveId, 'N4', 'x'), { warnings: 1, mayFight: false });
  const other = createSave(db, {});
  assert.deepEqual(warnNpc(db, other, 'N1', 'x'), { warnings: 1, mayFight: false });
  assert.throws(() => warnNpc(db, saveId, 'N9', 'x'), /unknown npc/i);
});

test('beginFight needs a hero, a complete world, and the npc at the hero location', () => {
  assert.throws(() => beginFight(...Object.values(ready({ hero: false })).slice(0, 2), { npcSlot: 'N1', tier: 'weak', aggressor: 'hero' }), /no hero/i);
  const early = ready({ world: false });
  assert.throws(() => beginFight(early.db, early.saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'hero' }), /not ready/i);
  const { db, saveId } = ready();
  assert.throws(() => beginFight(db, saveId, { npcSlot: 'N2', tier: 'weak', aggressor: 'hero' }), /not here/i);
  assert.throws(() => beginFight(db, saveId, { npcSlot: 'N1', tier: 'giant', aggressor: 'hero' }), /tier/i);
  assert.throws(() => beginFight(db, saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'bystander' }), /aggressor/i);
  assert.equal(count(db, 'fights'), 0);
});

test('an npc aggressor needs three warnings unless the fight is part of a quest', () => {
  const { db, saveId } = ready();
  warnNpc(db, saveId, 'N1', 'a');
  warnNpc(db, saveId, 'N1', 'b');
  assert.throws(() => beginFight(db, saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'npc', rng: heroFirst() }), /warning/i);
  warnNpc(db, saveId, 'N1', 'c');
  const state = beginFight(db, saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'npc', rng: heroFirst() });
  assert.equal(state.status, 'open');

  const quest = ready();
  const fight = beginFight(quest.db, quest.saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'npc', questId: 'dice-roll', rng: heroFirst() });
  assert.equal(quest.db.prepare('SELECT quest_id FROM fights WHERE id = ?').get(fight.fightId).quest_id, 'dice-roll');
  assert.throws(() => beginFight(quest.db, quest.saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'hero', rng: heroFirst() }), /already/i);
});

test('initiative decides who acts first and ties go to the hero', () => {
  const first = ready();
  const hero = beginFight(first.db, first.saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: heroFirst() });
  assert.deepEqual([hero.hero.hp, hero.enemy.hp], [12, 14]);

  const tie = ready();
  const tied = beginFight(tie.db, tie.saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: script([10, 20], [13, 20]) });
  assert.equal(tied.hero.hp, 12);

  const second = ready();
  const enemy = beginFight(second.db, second.saveId, {
    npcSlot: 'N1',
    tier: 'normal',
    aggressor: 'hero',
    rng: script([3, 20], [15, 20], [15, 20], [4, 6]),
  });
  assert.deepEqual([enemy.hero.hp, enemy.hero.hpMax], [8, 12]);
});

test('a hit lowers enemy HP, the enemy answers, and the log is gapless with linked rolls', () => {
  const { db, saveId } = ready();
  beginFight(db, saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: heroFirst() });
  const state = heroAttack(db, saveId, { rng: script([15, 20], [5, 8], [2, 20]) });
  assert.deepEqual([state.enemy.hp, state.hero.hp, state.round, state.status], [6, 12, 2, 'open']);
  const log = getFightLog(db, state.fightId);
  assert.deepEqual(log.map((s) => s.seq), log.map((_, i) => i + 1));
  assert.ok(log.filter((s) => ['attack', 'damage'].includes(s.action)).every((s) => s.rollId !== null));
});

test('a miss does no damage but the enemy still answers', () => {
  const { db, saveId } = ready();
  beginFight(db, saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: heroFirst() });
  const state = heroAttack(db, saveId, { rng: script([3, 20], [15, 20], [6, 6]) });
  assert.deepEqual([state.enemy.hp, state.hero.hp], [14, 6]);
});

test('winning kills the enemy and honor follows the aggressor', () => {
  const hero = ready();
  beginFight(hero.db, hero.saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'hero', rng: heroFirst() });
  const won = heroAttack(hero.db, hero.saveId, { rng: script([15, 20], [5, 8]) });
  assert.deepEqual([won.status, won.enemy.hp, won.honor], ['won', 0, -15]);
  assert.equal(getHonor(hero.db, hero.saveId), -15);
  assert.equal(getFightState(hero.db, hero.saveId), null);

  const npc = ready();
  ['a', 'b', 'c'].forEach((r) => warnNpc(npc.db, npc.saveId, 'N1', r));
  beginFight(npc.db, npc.saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'npc', rng: heroFirst() });
  const defended = heroAttack(npc.db, npc.saveId, { rng: script([15, 20], [5, 8]) });
  assert.deepEqual([defended.status, getHonor(npc.db, npc.saveId)], ['won', 0]);
});

test('defeat knocks the hero out, sends them to L1, and costs no honor', () => {
  const { db, saveId } = ready();
  go(db, saveId, 'L2');
  beginFight(db, saveId, { npcSlot: 'N2', tier: 'tough', aggressor: 'hero', rng: script([3, 20], [15, 20], [15, 20], [8, 8]) });
  const lost = heroAttack(db, saveId, { rng: script([2, 20], [15, 20], [8, 8]) });
  assert.deepEqual([lost.status, lost.hero.hp], ['lost', 0]);
  assert.equal(look(db, saveId).location.slot, 'L1');
  assert.equal(getHonor(db, saveId), 0);
  assert.equal(getFightState(db, saveId), null);
});

test('fleeing ends the fight with no honor change, and nothing works on an ended fight', () => {
  const { db, saveId } = ready();
  beginFight(db, saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: heroFirst() });
  assert.equal(fleeFight(db, saveId).status, 'fled');
  assert.equal(getHonor(db, saveId), 0);
  assert.throws(() => heroAttack(db, saveId, { rng: heroFirst() }), /no fight/i);
  assert.throws(() => fleeFight(db, saveId), /no fight/i);
});

test('a sure hit with double damage skips the attack roll result and doubles the damage', () => {
  const { db, saveId } = ready();
  beginFight(db, saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: heroFirst() });
  const state = heroAttack(db, saveId, { sureHit: true, doubleDamage: true, rng: script([1, 20], [3, 8], [2, 20]) });
  assert.equal(state.enemy.hp, 14 - (3 + 3) * 2);
});

test('a tamper reset abandons the open fight', () => {
  const { db, saveId } = ready();
  const { fightId } = beginFight(db, saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: heroFirst() });
  applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' });
  assert.equal(db.prepare('SELECT outcome FROM fights WHERE id = ?').get(fightId).outcome, 'abandoned');
  assert.equal(getFightState(db, saveId), null);
  assert.throws(() => heroAttack(db, saveId, { rng: heroFirst() }), /no fight/i);
});

test('a beaten npc is knocked out: no talking, warning, or fighting them again', () => {
  const { db, saveId } = ready();
  beginFight(db, saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'hero', rng: heroFirst() });
  assert.equal(heroAttack(db, saveId, { rng: script([15, 20], [5, 8]) }).status, 'won');
  assert.throws(() => talk(db, saveId, 'N1'), /knocked out/i);
  assert.throws(() => warnNpc(db, saveId, 'N1', 'again'), /knocked out/i);
  assert.throws(() => beginFight(db, saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'hero' }), /knocked out/i);
  assert.equal(count(db, 'fights'), 1);
  assert.equal(getHonor(db, saveId), -15);
});

test('warnings reset when a fight ends, win, loss, or flee', () => {
  const { db, saveId } = ready();
  ['a', 'b', 'c'].forEach((r) => warnNpc(db, saveId, 'N1', r));
  beginFight(db, saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'npc', rng: heroFirst() });
  fleeFight(db, saveId);
  assert.deepEqual(warnNpc(db, saveId, 'N1', 'new'), { warnings: 1, mayFight: false });
  assert.throws(() => beginFight(db, saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'npc' }), /warning/i);

  const other = ready();
  go(other.db, other.saveId, 'L2');
  ['a', 'b', 'c'].forEach((r) => warnNpc(other.db, other.saveId, 'N2', r));
  beginFight(other.db, other.saveId, { npcSlot: 'N2', tier: 'tough', aggressor: 'npc', rng: script([3, 20], [15, 20], [15, 20], [8, 8]) });
  assert.equal(heroAttack(other.db, other.saveId, { rng: script([2, 20], [15, 20], [8, 8]) }).status, 'lost');
  assert.deepEqual(warnNpc(other.db, other.saveId, 'N2', 'new'), { warnings: 1, mayFight: false });

  const win = ready();
  ['a', 'b', 'c'].forEach((r) => warnNpc(win.db, win.saveId, 'N1', r));
  beginFight(win.db, win.saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'npc', rng: heroFirst() });
  heroAttack(win.db, win.saveId, { rng: script([15, 20], [5, 8]) });
  assert.equal(win.db.prepare('SELECT COUNT(*) AS n FROM npc_warnings').get().n, 0);
});

test('an attack modifier turns a barely-hitting swing into a miss, and a natural 20 still hits', () => {
  const plain = ready();
  beginFight(plain.db, plain.saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: heroFirst() });
  assert.equal(heroAttack(plain.db, plain.saveId, { rng: script([7, 20], [5, 8], [2, 20]) }).enemy.hp, 14 - 8);

  const tired = ready();
  beginFight(tired.db, tired.saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: heroFirst() });
  const missed = heroAttack(tired.db, tired.saveId, { rng: script([7, 20], [2, 20]), modifiers: { attack: -2 } });
  assert.equal(missed.enemy.hp, 14);

  const crit = ready();
  beginFight(crit.db, crit.saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: heroFirst() });
  const lucky = heroAttack(crit.db, crit.saveId, { rng: script([20, 20], [4, 8], [4, 8], [2, 20]), modifiers: { attack: -10 } });
  assert.ok(lucky.enemy.hp < 14);
});

test('an AC modifier lets an enemy swing that missed by exactly 3 land, and never touches the enemy', () => {
  const plain = ready();
  beginFight(plain.db, plain.saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: heroFirst() });
  assert.equal(heroAttack(plain.db, plain.saveId, { rng: script([3, 20], [7, 20]) }).hero.hp, 12);

  const tired = ready();
  beginFight(tired.db, tired.saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: heroFirst() });
  const state = heroAttack(tired.db, tired.saveId, { rng: script([3, 20], [7, 20], [3, 6]), modifiers: { ac: -3 } });
  assert.deepEqual([state.hero.hp, state.enemy.ac, state.enemy.hpMax], [9, 12, 14]);
});

test('beginFight and loseHeroTurn use the modifiers for the enemy first turn too', () => {
  const first = ready();
  const begun = beginFight(first.db, first.saveId, {
    npcSlot: 'N1',
    tier: 'normal',
    aggressor: 'hero',
    rng: script([2, 20], [15, 20], [7, 20], [3, 6]),
    modifiers: { ac: -3 },
  });
  assert.equal(begun.hero.hp, 9);

  const lost = ready();
  beginFight(lost.db, lost.saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: heroFirst() });
  const after = loseHeroTurn(lost.db, lost.saveId, { rng: script([7, 20], [3, 6]), modifiers: { ac: -3 } });
  assert.equal(after.hero.hp, 9);
});
