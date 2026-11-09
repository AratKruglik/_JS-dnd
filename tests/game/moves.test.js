import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { proposeMove, checkMove } from '../../game/moves.js';
import { beginFight } from '../../game/combat-engine.js';
import { createSave, createHeroFromChoices } from '../../game/hero.js';
import { setSetting, fillWorld } from '../../game/world.js';
import { setLanguage } from '../../game/i18n.js';
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
  createHeroFromChoices(db, saveId, {
    name: 'Bilbo',
    race: 'hobbit',
    heroClass: 'fighter',
    scores: [8, 15, 14, 8, 8, 15],
  });
  setSetting(db, saveId, SETTING);
  fillWorld(db, saveId, goodWorld());
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-moves-'));
  const start = () =>
    beginFight(db, saveId, { npcSlot: 'N1', tier: 'normal', aggressor: 'hero', rng: script([15, 20], [10, 20]) });
  return { db, saveId, playerDir, start };
}

test('proposing needs an open fight, a valid problem, and no other open move, and writes nothing otherwise', () => {
  const { db, saveId, playerDir, start } = inFight();
  assert.throws(() => proposeMove(db, saveId, problem(), { playerDir }), /no fight/i);
  start();
  assert.throws(() => proposeMove(db, saveId, problem({ tests: TESTS.slice(0, 1) }), { playerDir }), /3 to 12/);
  assert.throws(
    () => proposeMove(db, saveId, problem({ reference: 'export function solve() { return 0; }' }), { playerDir }),
    /reference/i,
  );
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

test('checkMove passes tiredness modifiers to the enemy answer', () => {
  const { db, saveId, playerDir, start } = inFight();
  start();
  const { moveId, file } = proposeMove(db, saveId, problem(), { playerDir });
  writeFileSync(file, 'export function solve(a, b) { return a - b; }');
  const result = checkMove(db, saveId, moveId, { playerDir, rng: script([7, 20], [3, 6]), modifiers: { ac: -3 } });
  assert.equal(result.fight.hero.hp, 9);
});

test('a proposal whose stub cannot be written leaves no move row behind', () => {
  const { db, saveId, start } = inFight();
  start();
  const base = mkdtempSync(join(tmpdir(), 'jsdnd-moves-ro-'));
  const readOnly = join(base, 'locked');
  mkdirSync(readOnly);
  chmodSync(readOnly, 0o500);
  try {
    assert.throws(() => proposeMove(db, saveId, problem(), { playerDir: readOnly }));
  } finally {
    chmodSync(readOnly, 0o700);
  }
  assert.equal(count(db, 'fight_moves'), 0);
  const asFile = join(base, 'a-file');
  writeFileSync(asFile, 'x');
  assert.throws(() => proposeMove(db, saveId, problem(), { playerDir: asFile }));
  assert.equal(count(db, 'fight_moves'), 0);
});

test('a file the player already has for the move is kept as .old.js, not overwritten', () => {
  const { db, saveId, playerDir, start } = inFight();
  start();
  writeFileSync(join(playerDir, 'move-1.js'), '// my own work\n');
  const move = proposeMove(db, saveId, problem(), { playerDir });
  assert.equal(move.moveId, 1);
  assert.equal(readFileSync(join(playerDir, 'move-1.old.js'), 'utf8'), '// my own work\n');
  assert.match(readFileSync(move.file, 'utf8'), /export function solve/);
  assert.equal(existsSync(`${move.file}.tmp`), false);
});

test('the move stub is written in the language of the save, with the code part unchanged', () => {
  const english = inFight();
  english.start();
  const en = readFileSync(
    proposeMove(english.db, english.saveId, problem(), { playerDir: english.playerDir }).file,
    'utf8',
  );
  assert.match(en, /^\/\/ Combat move: Add two numbers\n/);
  assert.match(en, /\/\/ Export a function named solve\./);
  assert.match(en, /\/\/ your code here/);

  const ukrainian = inFight();
  setLanguage(ukrainian.db, ukrainian.saveId, 'uk');
  ukrainian.start();
  const uk = readFileSync(
    proposeMove(ukrainian.db, ukrainian.saveId, problem(), { playerDir: ukrainian.playerDir }).file,
    'utf8',
  );
  assert.match(uk, /^\/\/ Бойовий прийом: Add two numbers\n/);
  assert.match(uk, /\/\/ Експортуй функцію з назвою `solve`\./);
  assert.match(uk, /\/\/ твій код тут/);
  assert.doesNotMatch(uk, /Combat move|Export a function|your code here/);
  assert.match(uk, /export function solve\(\) \{/);
});
