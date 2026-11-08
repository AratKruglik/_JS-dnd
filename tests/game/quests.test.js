import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startQuest, checkQuest, judgeQuest, logHint, getProgress } from '../../game/quests.js';
import { QUESTS } from '../../quests/index.js';
import { createSave, createHero } from '../../game/hero.js';
import { getHonor, getHonorHistory } from '../../game/honor.js';
import { applyHonorRule } from '../../game/honor-rules.js';
import { applyTamperReset } from '../../game/reset.js';
import { freshDb, count } from './helpers.js';

const solutions = join(resolve(dirname(fileURLToPath(import.meta.url))), '..', 'quests', 'solutions');

function setup() {
  const db = freshDb();
  const saveId = createSave(db, {});
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-player-'));
  const opts = { playerDir, timeoutMs: 15000 };
  const put = (id, kind = 'reference') =>
    copyFileSync(join(solutions, `${id}.${kind}.js`), join(playerDir, `${id}.js`));
  const judge = (id, verdict, note = null) => judgeQuest(db, saveId, id, verdict, note, { playerDir });
  return { db, saveId, playerDir, opts, put, judge };
}

test('startQuest writes the stub once and never overwrites the players work', () => {
  const { playerDir } = setup();
  const first = startQuest('dice-roll', { playerDir });
  assert.equal(first.created, true);
  assert.equal(readFileSync(first.file, 'utf8'), QUESTS[0].stub);
  assert.ok(first.brief.length > 0);
  writeFileSync(first.file, '// my work\n');
  const second = startQuest('dice-roll', { playerDir });
  assert.equal(second.created, false);
  assert.equal(readFileSync(second.file, 'utf8'), '// my work\n');
  assert.throws(() => startQuest('nope', { playerDir }), /unknown quest/i);
});

test('a failed check records an attempt, returns retry with got and expected, and leaves honor unchanged', () => {
  const { db, saveId, opts, put, judge } = setup();
  put('array-sum', 'wrong');
  const result = checkQuest(db, saveId, 'array-sum', opts);
  assert.equal(result.status, 'fail');
  assert.equal(result.next, 'retry');
  assert.equal(result.tone, undefined);
  assert.ok(result.got && result.expected);
  assert.equal(count(db, 'quest_attempts'), 1);
  assert.equal(getHonor(db, saveId), 0);
});

test('a passing check returns judge with gentle tone at honor 0 and roast tone below 0', () => {
  const { db, saveId, opts, put, judge } = setup();
  put('string-shout');
  const first = checkQuest(db, saveId, 'string-shout', opts);
  assert.deepEqual([first.status, first.next, first.tone], ['pass', 'judge', 'gentle']);
  applyHonorRule(db, saveId, 'cheat');
  const second = checkQuest(db, saveId, 'string-shout', opts);
  assert.equal(second.tone, 'roast');
});

test('judge clean records the solve and gives +8 with no hints, +5 after a hint', () => {
  const { db, saveId, opts, put, judge } = setup();
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  assert.deepEqual(judge('dice-roll', 'clean'), { solved: true, honor: 8 });

  put('string-shout');
  logHint(db, saveId, 'string-shout', 'npc_speech');
  checkQuest(db, saveId, 'string-shout', opts);
  assert.deepEqual(judge('string-shout', 'clean'), { solved: true, honor: 13 });
  assert.equal(count(db, 'quest_solves'), 2);
});

test('judge cheated costs 15 honor and records no solve', () => {
  const { db, saveId, opts, put, judge } = setup();
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  assert.deepEqual(judge('dice-roll', 'cheated', 'copied the game dice'), {
    solved: false,
    honor: -15,
  });
  assert.equal(count(db, 'quest_solves'), 0);
  assert.equal(count(db, 'quest_judgments'), 1);
});

test('judging without a passing attempt is rejected, and so is judging twice', () => {
  const { db, saveId, opts, put, judge } = setup();
  assert.throws(() => judge('dice-roll', 'clean'), /passing attempt/i);
  put('dice-roll', 'wrong');
  checkQuest(db, saveId, 'dice-roll', opts);
  assert.throws(() => judge('dice-roll', 'clean'), /passing attempt/i);
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'cheated');
  assert.throws(() => judge('dice-roll', 'clean'), /already judged/i);
  assert.equal(getHonor(db, saveId), -15);
});

test('judging applies to the latest attempt only', () => {
  const { db, saveId, opts, put, judge } = setup();
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  put('dice-roll', 'wrong');
  checkQuest(db, saveId, 'dice-roll', opts);
  assert.throws(() => judge('dice-roll', 'clean'), /passing attempt/i);
});

test('a solved quest cannot be judged again in the same epoch to farm honor', () => {
  const { db, saveId, opts, put, judge } = setup();
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'clean');
  checkQuest(db, saveId, 'dice-roll', opts);
  assert.throws(() => judge('dice-roll', 'clean'), /already solved/i);
  assert.equal(getHonor(db, saveId), 8);
});

test('logHint counts hints per quest and applies honor for illegal_doc and master_leak only', () => {
  const { db, saveId } = setup();
  assert.equal(logHint(db, saveId, 'dice-roll', 'npc_speech').hintsUsed, 1);
  assert.equal(logHint(db, saveId, 'dice-roll', 'legal_doc').hintsUsed, 2);
  assert.equal(getHonor(db, saveId), 0);
  assert.equal(logHint(db, saveId, 'dice-roll', 'illegal_doc').hintsUsed, 3);
  assert.equal(getHonor(db, saveId), -2);
  assert.equal(logHint(db, saveId, 'dice-roll', 'master_leak').hintsUsed, 4);
  assert.equal(getHonor(db, saveId), -4);
  assert.equal(logHint(db, saveId, 'array-sum', 'npc_speech').hintsUsed, 1);
  assert.throws(() => logHint(db, saveId, 'dice-roll', 'rumor'));
});

test('after a tamper reset solved quests count as unsolved while history remains', () => {
  const { db, saveId, opts, put, judge } = setup();
  createHero(db, saveId, { name: 'Bilbo', race: 'hobbit', heroClass: 'rogue' });
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'clean');
  assert.deepEqual(getProgress(db, saveId).solved, ['dice-roll']);
  const honorEventsBefore = getHonorHistory(db, saveId).length;

  applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' });

  const progress = getProgress(db, saveId);
  assert.deepEqual(progress.solved, []);
  assert.equal(progress.epoch, 1);
  assert.equal(count(db, 'quest_attempts'), 1);
  assert.equal(count(db, 'quest_judgments'), 1);
  assert.equal(count(db, 'quest_solves'), 1);
  assert.equal(getHonorHistory(db, saveId).length, honorEventsBefore + 1);
});

test('a quest can be solved again after a reset and the old solve stays', () => {
  const { db, saveId, opts, put, judge } = setup();
  createHero(db, saveId, { name: 'Bilbo', race: 'hobbit', heroClass: 'rogue' });
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'clean');
  applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' });
  checkQuest(db, saveId, 'dice-roll', opts);
  assert.equal(judge('dice-roll', 'clean').solved, true);
  assert.equal(count(db, 'quest_solves'), 2);
  assert.deepEqual(getProgress(db, saveId).solved, ['dice-roll']);
});

test('getProgress lists solved and remaining in registry order', () => {
  const { db, saveId, opts, put, judge } = setup();
  put('array-sum');
  checkQuest(db, saveId, 'array-sum', opts);
  judge('array-sum', 'clean');
  assert.deepEqual(getProgress(db, saveId), {
    epoch: 0,
    solved: ['array-sum'],
    remaining: ['dice-roll', 'string-shout'],
    total: 3,
  });
});

test('judging is rejected when the file changed after the check', () => {
  const { db, saveId, playerDir, opts, put, judge } = setup();
  put('array-sum');
  checkQuest(db, saveId, 'array-sum', opts);
  appendFileSync(join(playerDir, 'array-sum.js'), '\n// edited after the check\n');
  assert.throws(() => judge('array-sum', 'clean'), /changed/i);
  assert.equal(count(db, 'quest_judgments'), 0);
  checkQuest(db, saveId, 'array-sum', opts);
  assert.equal(judge('array-sum', 'clean').solved, true);
});

test('a file that rewrites itself during the check cannot be judged as the code that ran', () => {
  const { db, saveId, playerDir, opts, judge } = setup();
  const code = [
    "import { writeFileSync } from 'node:fs';",
    'export function sumEven(numbers) { return numbers.filter((n) => n % 2 === 0).reduce((s, n) => s + n, 0); }',
    "writeFileSync(new URL(import.meta.url), 'export const sumEven = () => 0;\\n');",
  ].join('\n');
  writeFileSync(join(playerDir, 'array-sum.js'), code);
  assert.equal(checkQuest(db, saveId, 'array-sum', opts).status, 'pass');
  assert.throws(() => judge('array-sum', 'clean'), /changed/i);
  assert.equal(count(db, 'quest_solves'), 0);
});

test('hints from before a reset do not count in the new epoch', () => {
  const { db, saveId, opts, put, judge } = setup();
  createHero(db, saveId, { name: 'Bilbo', race: 'hobbit', heroClass: 'rogue' });
  logHint(db, saveId, 'dice-roll', 'npc_speech');
  applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' });
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'clean');
  assert.equal(db.prepare('SELECT hints_used FROM quest_solves').get().hints_used, 0);
  assert.equal(getHonor(db, saveId), -92);
  assert.equal(logHint(db, saveId, 'dice-roll', 'legal_doc').hintsUsed, 1);
});
