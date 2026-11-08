import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startQuest, checkQuest, judgeQuest, logHint, getProgress, revokeSolve } from '../../game/quests.js';
import { knockOut } from '../../game/knockouts.js';
import { talk } from '../../game/world.js';
import { QUESTS } from '../../quests/index.js';
import { createSave, createHero, createHeroFromChoices } from '../../game/hero.js';
import { setSetting, fillWorld } from '../../game/world.js';
import { getHonor, getHonorHistory } from '../../game/honor.js';
import { applyHonorRule } from '../../game/honor-rules.js';
import { applyTamperReset } from '../../game/reset.js';
import { freshDb, count, markSolved, markSolvedBefore } from './helpers.js';
import { SETTING, goodWorld } from './world-fixtures.js';

const solutions = join(resolve(dirname(fileURLToPath(import.meta.url))), '..', 'quests', 'solutions');

function bare() {
  const db = freshDb();
  const saveId = createSave(db, {});
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-player-'));
  return { db, saveId, playerDir, opts: { playerDir, timeoutMs: 15000 } };
}

function setup() {
  const db = freshDb();
  const saveId = createSave(db, {});
  createHeroFromChoices(db, saveId, {
    name: 'Bilbo',
    race: 'hobbit',
    heroClass: 'rogue',
    scores: [8, 15, 14, 8, 8, 15],
  });
  setSetting(db, saveId, SETTING);
  fillWorld(db, saveId, goodWorld());
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
  const { db, saveId, opts, put } = setup();
  markSolvedBefore(db, saveId, 'array-sum');
  const attemptsBefore = count(db, 'quest_attempts');
  put('array-sum', 'wrong');
  const result = checkQuest(db, saveId, 'array-sum', opts);
  assert.equal(result.status, 'fail');
  assert.equal(result.next, 'retry');
  assert.equal(result.tone, undefined);
  assert.ok(result.got && result.expected);
  assert.equal(count(db, 'quest_attempts'), attemptsBefore + 1);
  assert.equal(getHonor(db, saveId), 0);
});

test('a passing check returns judge with gentle tone at honor 0 and roast tone below 0', () => {
  const { db, saveId, opts, put } = setup();
  markSolvedBefore(db, saveId, 'string-shout');
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
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'clean');
  assert.deepEqual(getProgress(db, saveId), {
    epoch: 0,
    solved: ['dice-roll'],
    remaining: ['string-shout', 'array-sum'],
    total: 3,
  });
});

test('judging is rejected when the file changed after the check', () => {
  const { db, saveId, playerDir, opts, put, judge } = setup();
  markSolvedBefore(db, saveId, 'array-sum');
  const judgmentsBefore = count(db, 'quest_judgments');
  put('array-sum');
  checkQuest(db, saveId, 'array-sum', opts);
  appendFileSync(join(playerDir, 'array-sum.js'), '\n// edited after the check\n');
  assert.throws(() => judge('array-sum', 'clean'), /changed/i);
  assert.equal(count(db, 'quest_judgments'), judgmentsBefore);
  checkQuest(db, saveId, 'array-sum', opts);
  assert.equal(judge('array-sum', 'clean').solved, true);
});

test('a file that rewrites itself during the check cannot be judged as the code that ran', () => {
  const { db, saveId, playerDir, opts, judge } = setup();
  markSolvedBefore(db, saveId, 'array-sum');
  const solvesBefore = count(db, 'quest_solves');
  const code = [
    "import { writeFileSync } from 'node:fs';",
    'export function sumEven(numbers) { return numbers.filter((n) => n % 2 === 0).reduce((s, n) => s + n, 0); }',
    "writeFileSync(new URL(import.meta.url), 'export const sumEven = () => 0;\\n');",
  ].join('\n');
  writeFileSync(join(playerDir, 'array-sum.js'), code);
  assert.equal(checkQuest(db, saveId, 'array-sum', opts).status, 'pass');
  assert.throws(() => judge('array-sum', 'clean'), /changed/i);
  assert.equal(count(db, 'quest_solves'), solvesBefore);
});

test('hints from before a reset do not count in the new epoch', () => {
  const { db, saveId, opts, put, judge } = setup();
  logHint(db, saveId, 'dice-roll', 'npc_speech');
  applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' });
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'clean');
  assert.equal(db.prepare('SELECT hints_used FROM quest_solves').get().hints_used, 0);
  assert.equal(getHonor(db, saveId), -92);
  assert.equal(logHint(db, saveId, 'dice-roll', 'legal_doc').hintsUsed, 1);
});

test('a failure while judging leaves no judgment, solve, or honor behind', () => {
  const { db, saveId, opts, put, judge } = setup();
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  db.exec("CREATE TRIGGER boom BEFORE INSERT ON honor_events BEGIN SELECT RAISE(ABORT, 'boom'); END");
  assert.throws(() => judge('dice-roll', 'clean'), /boom/);
  db.exec('DROP TRIGGER boom');
  assert.deepEqual([count(db, 'quest_judgments'), count(db, 'quest_solves'), count(db, 'honor_events')], [0, 0, 0]);
});

test('a failure while logging an illegal link leaves no hint row behind', () => {
  const { db, saveId } = setup();
  db.exec("CREATE TRIGGER boom BEFORE INSERT ON honor_events BEGIN SELECT RAISE(ABORT, 'boom'); END");
  assert.throws(() => logHint(db, saveId, 'dice-roll', 'illegal_doc', 'https://example.com'), /boom/);
  db.exec('DROP TRIGGER boom');
  assert.equal(count(db, 'quest_hints'), 0);
});

function worldSave() {
  const db = freshDb();
  const saveId = createSave(db, {});
  createHeroFromChoices(db, saveId, {
    name: 'Bilbo',
    race: 'hobbit',
    heroClass: 'rogue',
    scores: [8, 15, 14, 8, 8, 15],
  });
  setSetting(db, saveId, SETTING);
  fillWorld(db, saveId, goodWorld());
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-gate-'));
  const put = (id) => copyFileSync(join(solutions, `${id}.reference.js`), join(playerDir, `${id}.js`));
  return { db, saveId, playerDir, opts: { playerDir, timeoutMs: 15000 }, put };
}

test('quest start, check, and judge need a hero', () => {
  const { db, saveId, playerDir, opts } = bare();
  assert.throws(() => startQuest('dice-roll', { playerDir, db, saveId }), /no hero/i);
  assert.throws(() => checkQuest(db, saveId, 'dice-roll', opts), /no hero/i);
  assert.throws(() => judgeQuest(db, saveId, 'dice-roll', 'clean', null, { playerDir }), /no hero/i);
  assert.equal(count(db, 'quest_attempts'), 0);
});

test('quest start, check, and judge need a finished world', () => {
  const { db, saveId, playerDir, opts } = bare();
  createHero(db, saveId, { name: 'Bilbo', race: 'hobbit', heroClass: 'rogue' });
  assert.throws(() => startQuest('dice-roll', { playerDir, db, saveId }), /not ready/i);
  assert.throws(() => checkQuest(db, saveId, 'dice-roll', opts), /not ready/i);
  assert.throws(() => judgeQuest(db, saveId, 'dice-roll', 'clean', null, { playerDir }), /not ready/i);
});

test('a quest opens only after every earlier quest is solved in this epoch', () => {
  const { db, saveId, playerDir, opts, put } = worldSave();
  put('string-shout');
  assert.throws(() => startQuest('string-shout', { playerDir, db, saveId }), /not open.*dice-roll/i);
  assert.throws(() => checkQuest(db, saveId, 'string-shout', opts), /not open.*dice-roll/i);
  assert.equal(count(db, 'quest_attempts'), 0);
  assert.equal(startQuest('dice-roll', { playerDir, db, saveId }).questId, 'dice-roll');

  markSolved(db, saveId, 'dice-roll');
  assert.equal(checkQuest(db, saveId, 'string-shout', opts).status, 'pass');
  put('array-sum');
  assert.throws(() => checkQuest(db, saveId, 'array-sum', opts), /not open.*string-shout/i);
});

test('judging is refused when an earlier quest stopped counting after a reset', () => {
  const { db, saveId, playerDir, opts, put } = worldSave();
  markSolved(db, saveId, 'dice-roll');
  put('string-shout');
  checkQuest(db, saveId, 'string-shout', opts);
  applyTamperReset(db, saveId, { expected: 'a', found: 'b' });
  assert.throws(() => judgeQuest(db, saveId, 'string-shout', 'clean', null, { playerDir }), /not open.*dice-roll/i);
});

test('startQuest without a database still writes the stub, for tools that have no save', () => {
  const { playerDir } = bare();
  assert.equal(startQuest('array-sum', { playerDir }).created, true);
});

test('a late cheated verdict revokes a judged solve, once, with the cheat penalty', () => {
  const { db, saveId, opts, put, judge } = setup();
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'clean');
  assert.equal(getHonor(db, saveId), 8);

  const revoked = revokeSolve(db, saveId, 'dice-roll', 'copied the dice file');
  assert.equal(revoked.revoked, true);
  assert.equal(getHonor(db, saveId), 8 - 8 - 15);
  assert.deepEqual(getProgress(db, saveId).solved, []);
  assert.deepEqual(
    getHonorHistory(db, saveId)
      .slice(-2)
      .map((e) => [e.kind, e.delta]),
    [
      ['revoke_bonus', -8],
      ['cheat', -15],
    ],
  );
  assert.throws(() => revokeSolve(db, saveId, 'dice-roll', 'again'), /already revoked/i);
  assert.equal(getHonor(db, saveId), 8 - 8 - 15);
});

test('only a solved quest of this epoch can be revoked', () => {
  const { db, saveId, opts, put, judge } = setup();
  assert.throws(() => revokeSolve(db, saveId, 'dice-roll', 'x'), /not solved/i);
  assert.throws(() => revokeSolve(db, saveId, 'nope', 'x'), /unknown quest/i);
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'clean');
  applyTamperReset(db, saveId, { expected: 'a', found: 'b' });
  assert.throws(() => revokeSolve(db, saveId, 'dice-roll', 'x'), /not solved/i);
});

test('a revoked quest can be solved again, in the same row, and counts once more', () => {
  const { db, saveId, opts, put, judge } = setup();
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'clean');
  revokeSolve(db, saveId, 'dice-roll', 'cheated');
  checkQuest(db, saveId, 'dice-roll', opts);
  assert.equal(judge('dice-roll', 'clean').solved, true);
  assert.deepEqual(getProgress(db, saveId).solved, ['dice-roll']);
  const rows = db.prepare("SELECT revoked_at FROM quest_solves WHERE quest_id = 'dice-roll'").all();
  assert.deepEqual(
    rows.map((r) => r.revoked_at),
    [null],
  );
});

test('a revoke and a new solve still wake an NPC the hero knocked out', () => {
  const { db, saveId, opts, put, judge } = setup();
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'clean');
  knockOut(db, saveId, 'N1');
  assert.throws(() => talk(db, saveId, 'N1'), /knocked out/i);
  revokeSolve(db, saveId, 'dice-roll', 'cheated');
  assert.throws(() => talk(db, saveId, 'N1'), /knocked out/i);
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'clean');
  assert.equal(talk(db, saveId, 'N1').npc.slot, 'N1');
});

test('a failure while revoking leaves the solve and the honor alone', () => {
  const { db, saveId, opts, put, judge } = setup();
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'clean');
  db.exec("CREATE TRIGGER boom BEFORE INSERT ON honor_events BEGIN SELECT RAISE(ABORT, 'boom'); END");
  assert.throws(() => revokeSolve(db, saveId, 'dice-roll', 'x'), /boom/);
  db.exec('DROP TRIGGER boom');
  assert.deepEqual(getProgress(db, saveId).solved, ['dice-roll']);
  assert.equal(getHonor(db, saveId), 8);
});

test('being caught late costs the same as being caught at judging, once the quest is solved honestly', () => {
  const late = setup();
  late.put('dice-roll');
  checkQuest(late.db, late.saveId, 'dice-roll', late.opts);
  late.judge('dice-roll', 'clean');
  revokeSolve(late.db, late.saveId, 'dice-roll', 'cheated');
  checkQuest(late.db, late.saveId, 'dice-roll', late.opts);
  late.judge('dice-roll', 'clean');

  const early = setup();
  early.put('dice-roll');
  checkQuest(early.db, early.saveId, 'dice-roll', early.opts);
  early.judge('dice-roll', 'cheated');
  checkQuest(early.db, early.saveId, 'dice-roll', early.opts);
  early.judge('dice-roll', 'clean');

  assert.equal(getHonor(late.db, late.saveId), getHonor(early.db, early.saveId));
  assert.equal(getHonor(late.db, late.saveId), -15 + 8);
});

test('a revoke takes back only the bonus that was really paid, so a solve with hints loses +5', () => {
  const { db, saveId, opts, put, judge } = setup();
  logHint(db, saveId, 'dice-roll', 'npc_speech', 'the mentor hinted');
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'clean');
  assert.equal(getHonor(db, saveId), 5);
  revokeSolve(db, saveId, 'dice-roll', 'cheated');
  assert.equal(getHonor(db, saveId), 5 - 5 - 15);
});

test('a cheated verdict leaves a knocked out NPC asleep, and only a clean solve wakes them', () => {
  const { db, saveId, opts, put, judge } = setup();
  knockOut(db, saveId, 'N1');
  put('dice-roll');
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'cheated');
  assert.throws(() => talk(db, saveId, 'N1'), /knocked out/i);
  checkQuest(db, saveId, 'dice-roll', opts);
  judge('dice-roll', 'clean');
  assert.equal(talk(db, saveId, 'N1').npc.slot, 'N1');
});
