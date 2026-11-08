import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUESTS } from '../../quests/index.js';
import { runQuestCheck } from '../../game/quest-runner.js';

const solutions = join(resolve(dirname(fileURLToPath(import.meta.url))), 'solutions');
const solution = (id, kind) => join(solutions, `${id}.${kind}.js`);

test('the registry lists the three quests in order with sane metadata', () => {
  assert.deepEqual(
    QUESTS.map((q) => q.id),
    ['dice-roll', 'string-shout', 'array-sum'],
  );
  assert.equal(new Set(QUESTS.map((q) => q.id)).size, QUESTS.length);
  for (const quest of QUESTS) {
    assert.equal(quest.file, undefined, 'the path depends on the player folder, so it is not stored on the quest');
    assert.ok(quest.complexity >= 1 && quest.complexity <= 5);
    assert.ok(quest.title && quest.brief);
    assert.match(quest.stub, /export/);
  }
});

for (const { id } of [{ id: 'dice-roll' }, { id: 'string-shout' }, { id: 'array-sum' }]) {
  test(`${id}: the reference solution passes`, () => {
    const result = runQuestCheck(id, solution(id, 'reference'), { timeoutMs: 15000 });
    assert.equal(result.status, 'pass', `${result.message} | got ${result.got} | expected ${result.expected}`);
  });

  test(`${id}: a wrong solution fails with a readable got and expected`, () => {
    const result = runQuestCheck(id, solution(id, 'wrong'), { timeoutMs: 15000 });
    assert.equal(result.status, 'fail');
    assert.ok(result.expected.length > 0 && result.got.length > 0);
    assert.notEqual(result.got, result.expected);
  });

  test(`${id}: a hardcoded solution fails`, () => {
    const result = runQuestCheck(id, solution(id, 'hardcoded'), { timeoutMs: 15000 });
    assert.equal(result.status, 'fail');
  });
}

const DICE_MUTANTS = {
  'ignores the rng it is given': 'export function rollDie(sides) { return Math.floor(Math.random() * sides) + 1; }',
  'rounds instead of flooring':
    'export function rollDie(sides, rng = Math.random) { return Math.round(rng() * sides); }',
  'never reaches the top face':
    'export function rollDie(sides, rng = Math.random) { return Math.floor(rng() * (sides - 1)) + 1; }',
  'starts at zero': 'export function rollDie(sides, rng = Math.random) { return Math.floor(rng() * sides); }',
};

for (const [name, code] of Object.entries(DICE_MUTANTS)) {
  test(`dice-roll: a die that ${name} fails`, () => {
    const file = join(mkdtempSync(join(tmpdir(), 'jsdnd-dice-mutant-')), 'dice-roll.js');
    writeFileSync(file, code);
    const result = runQuestCheck('dice-roll', file, { timeoutMs: 15000 });
    assert.equal(result.status, 'fail', result.message);
  });
}
