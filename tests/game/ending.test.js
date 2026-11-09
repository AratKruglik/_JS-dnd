import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { endingStatus, buildEnding } from '../../game/ending.js';
import { beginFight, heroAttack } from '../../game/combat-engine.js';
import { createSave, createHeroFromChoices } from '../../game/hero.js';
import { setSetting, fillWorld } from '../../game/world.js';
import { checkQuest, judgeQuest, revokeSolve } from '../../game/quests.js';
import { applyTamperReset } from '../../game/reset.js';
import { QUESTS } from '../../quests/index.js';
import { freshDb, markSolved } from './helpers.js';
import { setLanguage } from '../../game/i18n.js';
import { questText } from '../../quests/text/index.js';
import { SETTING, goodWorld } from './world-fixtures.js';

const solutions = join(resolve(dirname(fileURLToPath(import.meta.url))), '..', 'quests', 'solutions');
const HERO = { name: 'Bilbo', race: 'hobbit', heroClass: 'rogue', scores: [8, 15, 14, 8, 8, 15] };
const LOW = () => 0.01;
const pause = (ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end);
};

function ready() {
  const db = freshDb();
  const saveId = createSave(db, {});
  createHeroFromChoices(db, saveId, HERO);
  setSetting(db, saveId, SETTING);
  fillWorld(db, saveId, goodWorld());
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-ending-'));
  const solveAll = () => {
    for (const quest of QUESTS) {
      copyFileSync(join(solutions, `${quest.id}.reference.js`), join(playerDir, `${quest.id}.js`));
      checkQuest(db, saveId, quest.id, { playerDir, timeoutMs: 15000 });
      judgeQuest(db, saveId, quest.id, 'clean', null, { playerDir });
    }
  };
  const atStronghold = () => db.prepare("UPDATE heroes SET location_slot = 'L6' WHERE save_id = ?").run(saveId);
  // The hero always goes first and the boss always misses, so the fight is a plain grind.
  const winBoss = () => {
    // The win must land strictly after the latest solve, and timestamps are millisecond ISO strings.
    pause(2);
    atStronghold();
    beginFight(db, saveId, { npcSlot: 'N7', tier: 'tough', aggressor: 'hero', rng: LOW });
    let state;
    do state = heroAttack(db, saveId, { rng: LOW, sureHit: true, doubleDamage: true });
    while (state.status === 'open');
    return state;
  };
  return { db, saveId, solveAll, atStronghold, winBoss, playerDir };
}

test('a fresh save is locked with nothing solved', () => {
  const { db, saveId } = ready();
  assert.deepEqual(endingStatus(db, saveId), { questsSolved: 0, questsTotal: 3, bossDefeated: false, unlocked: false });
});

test('all quests solved without the boss stays locked', () => {
  const { db, saveId, solveAll } = ready();
  solveAll();
  const status = endingStatus(db, saveId);
  assert.deepEqual([status.questsSolved, status.bossDefeated, status.unlocked], [3, false, false]);
});

test('a boss win without the quests stays locked', () => {
  const { db, saveId } = ready();
  db.prepare(
    "INSERT INTO fights (save_id, started_at, ended_at, trigger_reason, outcome, npc_slot) VALUES (?, ?, ?, 'x', 'won', 'N7')",
  ).run(saveId, new Date().toISOString(), new Date().toISOString());
  const status = endingStatus(db, saveId);
  assert.deepEqual([status.bossDefeated, status.unlocked], [true, false]);
});

test('every quest plus the boss unlocks the ending, and a tamper reset locks it again until both are redone', () => {
  const { db, saveId, solveAll, winBoss } = ready();
  solveAll();
  winBoss();
  assert.equal(endingStatus(db, saveId).unlocked, true);

  pause(5);
  applyTamperReset(db, saveId, { expected: 'a', found: 'b' });
  const reset = endingStatus(db, saveId);
  assert.deepEqual([reset.questsSolved, reset.bossDefeated, reset.unlocked], [0, false, false]);

  pause(5);
  solveAll();
  assert.equal(endingStatus(db, saveId).unlocked, false);
  db.prepare('UPDATE heroes SET level = 1 WHERE save_id = ?').run(saveId);
  winBoss();
  assert.equal(endingStatus(db, saveId).unlocked, true);
});

test('the boss fight is refused until every quest is solved, and only at tough', () => {
  const { db, saveId, solveAll, atStronghold } = ready();
  atStronghold();
  assert.throws(() => beginFight(db, saveId, { npcSlot: 'N7', tier: 'tough', aggressor: 'hero' }), /quest/i);
  solveAll();
  for (const tier of ['weak', 'normal']) {
    assert.throws(() => beginFight(db, saveId, { npcSlot: 'N7', tier, aggressor: 'hero' }), /tough/i);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM fights').get().n, 0);
  assert.equal(
    beginFight(db, saveId, { npcSlot: 'N7', tier: 'tough', aggressor: 'hero', rng: LOW }).enemy.tier,
    'tough',
  );
});

test('winning against the boss reports endingUnlocked, winning against anyone else does not', () => {
  const { db, saveId, solveAll, winBoss } = ready();
  const first = beginFight(db, saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'hero', rng: LOW });
  assert.equal(first.status, 'open');
  let state;
  do state = heroAttack(db, saveId, { rng: LOW, sureHit: true, doubleDamage: true });
  while (state.status === 'open');
  assert.equal(state.status, 'won');
  assert.equal('endingUnlocked' in state, false);

  solveAll();
  assert.equal(winBoss().endingUnlocked, true);
});

test('the boss win without every quest never reports endingUnlocked', () => {
  const { db, saveId, atStronghold } = ready();
  atStronghold();
  // Bypass the gate on purpose: write the boss fight as the engine would have left it.
  db.prepare(
    "INSERT INTO fights (save_id, started_at, trigger_reason, npc_slot, aggressor, enemy_name, enemy_tier, enemy_hp, enemy_hp_max, enemy_ac, hero_hp, hero_hp_max) VALUES (?, ?, 'x', 'N7', 'hero', 'Boss', 'tough', 1, 26, 14, 12, 12)",
  ).run(saveId, new Date().toISOString());
  const state = heroAttack(db, saveId, { rng: LOW, sureHit: true, doubleDamage: true });
  assert.equal(state.status, 'won');
  assert.equal('endingUnlocked' in state, false);
});

test('buildEnding writes the page only when the ending is unlocked', () => {
  const { db, saveId, solveAll, winBoss } = ready();
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-page-'));
  assert.throws(() => buildEnding(db, saveId, { playerDir: dir }), /not over|boss|quest/i);
  assert.equal(existsSync(join(dir, 'ending.html')), false);
  solveAll();
  winBoss();
  const built = buildEnding(db, saveId, { playerDir: dir });
  assert.equal(built.file, join(dir, 'ending.html'));
  const html = readFileSync(built.file, 'utf8');
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Bilbo/);
  assert.match(html, /3 of 3/);
});

test('a boss fight that was lost, fled, or abandoned never unlocks the ending', () => {
  const { db, saveId, solveAll } = ready();
  solveAll();
  for (const outcome of ['lost', 'fled', 'abandoned']) {
    db.prepare(
      "INSERT INTO fights (save_id, started_at, ended_at, trigger_reason, outcome, npc_slot) VALUES (?, ?, ?, 'x', ?, 'N7')",
    ).run(saveId, new Date().toISOString(), new Date().toISOString(), outcome);
    const status = endingStatus(db, saveId);
    assert.deepEqual([status.bossDefeated, status.unlocked], [false, false], outcome);
  }
});

test('a boss win in another save does not unlock this one', () => {
  const { db, saveId, solveAll } = ready();
  solveAll();
  const other = createSave(db, {});
  db.prepare(
    "INSERT INTO fights (save_id, started_at, ended_at, trigger_reason, outcome, npc_slot) VALUES (?, ?, ?, 'x', 'won', 'N7')",
  ).run(other, new Date().toISOString(), new Date().toISOString());
  assert.equal(endingStatus(db, saveId).bossDefeated, false);
});

test('a quest solved after the boss win locks the ending until the boss is beaten again', () => {
  const { db, saveId, solveAll, winBoss } = ready();
  solveAll();
  winBoss();
  assert.equal(endingStatus(db, saveId).unlocked, true);

  pause(5);
  // A quest that did not exist when the boss fell, solved afterwards.
  markSolved(db, saveId, 'future-quest');
  const locked = endingStatus(db, saveId);
  assert.deepEqual([locked.bossDefeated, locked.unlocked], [false, false]);

  pause(5);
  const again = winBoss();
  assert.equal(again.endingUnlocked, true);
  assert.equal(endingStatus(db, saveId).unlocked, true);
});

test('revoking a solve locks the ending and the boss, and the boss must fall again after the re-solve', () => {
  const { db, saveId, solveAll, winBoss, playerDir } = ready();
  solveAll();
  winBoss();
  assert.equal(endingStatus(db, saveId).unlocked, true);

  revokeSolve(db, saveId, 'array-sum', 'the Master found a hardcoded answer');
  const locked = endingStatus(db, saveId);
  assert.deepEqual([locked.questsSolved, locked.unlocked], [2, false]);
  assert.throws(() => beginFight(db, saveId, { npcSlot: 'N7', tier: 'tough', aggressor: 'hero' }), /array-sum/i);

  pause(5);
  checkQuest(db, saveId, 'array-sum', { playerDir, timeoutMs: 15000 });
  judgeQuest(db, saveId, 'array-sum', 'clean', null, { playerDir });
  assert.equal(endingStatus(db, saveId).unlocked, false);
  pause(5);
  assert.equal(winBoss().endingUnlocked, true);
});

test('a reset or a solve in the same millisecond as the boss win does not count as before it', () => {
  const { db, saveId } = ready();
  const at = new Date().toISOString();
  db.prepare(
    "INSERT INTO fights (save_id, started_at, ended_at, trigger_reason, outcome, npc_slot) VALUES (?, ?, ?, 'x', 'won', 'N7')",
  ).run(saveId, at, at);
  db.prepare(
    "INSERT INTO resets (save_id, created_at, reason, fingerprint_expected, fingerprint_found) VALUES (?, ?, 'x', 'a', 'b')",
  ).run(saveId, at);
  assert.equal(endingStatus(db, saveId).bossDefeated, false);

  const solved = ready();
  solved.db
    .prepare(
      "INSERT INTO fights (save_id, started_at, ended_at, trigger_reason, outcome, npc_slot) VALUES (?, ?, ?, 'x', 'won', 'N7')",
    )
    .run(solved.saveId, at, at);
  markSolved(solved.db, solved.saveId, 'dice-roll', at);
  assert.equal(endingStatus(solved.db, solved.saveId).bossDefeated, false);
});

test('the ending page is built in the language of the save', () => {
  const { db, saveId, solveAll, winBoss } = ready();
  solveAll();
  winBoss();
  setLanguage(db, saveId, 'uk');
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-page-uk-'));
  const html = readFileSync(buildEnding(db, saveId, { playerDir: dir }).file, 'utf8');
  assert.match(html, /<html lang="uk">/);
  assert.match(html, /кінець дороги/);
  assert.ok(html.includes(questText('dice-roll', 'uk').title));
});
