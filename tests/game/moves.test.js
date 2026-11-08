import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { proposeMove, checkMove } from '../../game/moves.js';
import { beginFight } from '../../game/combat-engine.js';
import { createSave, createHeroFromChoices } from '../../game/hero.js';
import { setSetting, fillWorld } from '../../game/world.js';
import { freshDb, count } from './helpers.js';
import { SETTING, goodWorld } from './world-fixtures.js';

const script = (...pairs) => {
  let i = 0;
  return () => {
    const [value, sides] = pairs[i++];
    return (value - 0.5) / sides;
  };
};

const TESTS = [
  { args: [1, 2], expected: 3 },
  { args: [2, 2], expected: 4 },
  { args: [10, -3], expected: 7 },
];
const problem = (overrides = {}) => ({
  title: 'Add two numbers',
  brief: 'Write solve(a, b) that returns the sum.\nIt must work for negatives.',
  difficulty: 1,
  tests: TESTS,
  reference: 'export function solve(a, b) { return a + b; }',
  ...overrides,
});

function inFight() {
  const db = freshDb();
  const saveId = createSave(db, {});
  createHeroFromChoices(db, saveId, { name: 'Bilbo', race: 'hobbit', heroClass: 'rogue', scores: [8, 15, 14, 8, 8, 15] });
  setSetting(db, saveId, SETTING);
  fillWorld(db, saveId, goodWorld());
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-moves-'));
  const start = () => beginFight(db, saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: script([15, 20], [10, 20]) });
  return { db, saveId, playerDir, start };
}

test('proposing needs an open fight, a valid problem, and no other open move, and writes nothing otherwise', () => {
  const { db, saveId, playerDir, start } = inFight();
  assert.throws(() => proposeMove(db, saveId, problem(), { playerDir }), /no fight/i);
  start();
  assert.throws(() => proposeMove(db, saveId, problem({ tests: TESTS.slice(0, 1) }), { playerDir }), /3 to 12/);
  assert.throws(() => proposeMove(db, saveId, problem({ reference: 'export function solve() { return 0; }' }), { playerDir }), /reference/i);
  assert.equal(count(db, 'fight_moves'), 0);
  assert.equal(existsSync(join(playerDir, 'move-1.js')), false);
  proposeMove(db, saveId, problem(), { playerDir });
  assert.throws(() => proposeMove(db, saveId, problem(), { playerDir }), /open move/i);
});

test('a good proposal stores the hidden tests, writes a stub, and returns only the brief', () => {
  const { db, saveId, playerDir, start } = inFight();
  start();
  const proposal = proposeMove(db, saveId, problem(), { playerDir });
  assert.deepEqual(Object.keys(proposal).sort(), ['brief', 'file', 'moveId', 'title']);
  assert.match(readFileSync(proposal.file, 'utf8'), /export function solve/);
  const row = db.prepare('SELECT * FROM fight_moves WHERE id = ?').get(proposal.moveId);
  assert.deepEqual([row.status, row.difficulty], ['open', 1]);
  assert.deepEqual(JSON.parse(row.tests), TESTS);
  assert.equal(db.prepare('SELECT id FROM fights').get().id, row.fight_id);
});

test('a correct solution wins the move: a sure hit with double damage', () => {
  const { db, saveId, playerDir, start } = inFight();
  start();
  const { moveId, file } = proposeMove(db, saveId, problem(), { playerDir });
  writeFileSync(file, 'export function solve(a, b) { return a + b; }');
  const result = checkMove(db, saveId, moveId, { playerDir, rng: script([1, 20], [3, 8], [2, 20]) });
  assert.equal(result.moveStatus, 'won');
  assert.equal(result.check.status, 'pass');
  assert.equal(result.fight.enemy.hp, 14 - (3 + 3) * 2);
});

test('a wrong, looping, throwing, or missing solution loses the turn but the enemy still answers', () => {
  const codes = [
    'export function solve(a, b) { return a - b; }',
    'export function solve() { while (true) {} }',
    "export function solve() { throw new Error('nope'); }",
    null,
  ];
  for (const code of codes) {
    const { db, saveId, playerDir, start } = inFight();
    start();
    const { moveId, file } = proposeMove(db, saveId, problem(), { playerDir });
    if (code === null) rmSync(file);
    else writeFileSync(file, code);
    const result = checkMove(db, saveId, moveId, { playerDir, timeoutMs: 500, rng: script([15, 20], [4, 6]) });
    assert.equal(result.moveStatus, 'failed', code ?? 'missing file');
    assert.equal(result.fight.enemy.hp, 14);
    assert.equal(result.fight.hero.hp, 8);
  }
});

test('a move can be checked only once and only inside its fight', () => {
  const { db, saveId, playerDir, start } = inFight();
  start();
  const { moveId, file } = proposeMove(db, saveId, problem(), { playerDir });
  writeFileSync(file, 'export function solve(a, b) { return a + b; }');
  checkMove(db, saveId, moveId, { playerDir, rng: script([1, 20], [3, 8], [2, 20]) });
  assert.throws(() => checkMove(db, saveId, moveId, { playerDir }), /already|not open/i);
  assert.throws(() => checkMove(db, saveId, 999, { playerDir }), /no move|not found/i);
});
