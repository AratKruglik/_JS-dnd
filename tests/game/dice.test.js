import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpec, roll, SIDES } from '../../game/dice.js';
import { rollAndLog } from '../../game/rolls.js';
import { createSave } from '../../game/hero.js';
import { freshDb, count } from './helpers.js';

test('parseSpec and roll reject bad input', () => {
  for (const bad of ['0d6', '101d6', '1d7', 'd', 'abc', '1.5d6', '-1d6', '']) {
    assert.throws(() => parseSpec(bad), /dice/i, `parseSpec should reject "${bad}"`);
    assert.throws(() => roll(bad), /dice/i, `roll should reject "${bad}"`);
  }
  assert.deepEqual(SIDES, [4, 6, 8, 10, 12, 20, 100]);
  assert.deepEqual(parseSpec('d20'), { count: 1, sides: 20 });
  assert.deepEqual(parseSpec('3d6'), { count: 3, sides: 6 });
});

test('roll maps rng 0 to 1 and 0.999999 to the top face', () => {
  assert.deepEqual(roll('1d20', () => 0).results, [1]);
  assert.deepEqual(roll('1d20', () => 0.999999).results, [20]);
});

test('roll returns count results and their sum as total', () => {
  const sequence = [0, 0.5, 0.999999];
  let i = 0;
  const result = roll('3d6', () => sequence[i++]);
  assert.deepEqual(result.results, [1, 4, 6]);
  assert.equal(result.total, 11);
  assert.equal(result.count, 3);
  assert.equal(result.sides, 6);
  assert.equal(result.spec, '3d6');
});

test('statistical sanity: 6000 real d6 rolls land every face between 800 and 1200 times', () => {
  const tally = new Array(7).fill(0);
  for (let i = 0; i < 60; i++) {
    for (const face of roll('100d6').results) tally[face] += 1;
  }
  for (let face = 1; face <= 6; face++) {
    assert.ok(tally[face] >= 800 && tally[face] <= 1200, `face ${face} came up ${tally[face]} times`);
  }
});

test('rollAndLog stores the roll and returns its id', () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  const logged = rollAndLog(db, saveId, '2d8', 'goblin attack', () => 0);
  assert.equal(logged.total, 2);
  const row = db.prepare('SELECT * FROM dice_rolls WHERE id = ?').get(logged.id);
  assert.equal(row.spec, '2d8');
  assert.deepEqual(JSON.parse(row.results), [1, 1]);
  assert.equal(row.total, 2);
  assert.equal(row.context, 'goblin attack');
  assert.equal(row.save_id, saveId);
});

test('a rejected spec writes nothing', () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  assert.throws(() => rollAndLog(db, saveId, '1000d6'), /dice/i);
  assert.equal(count(db, 'dice_rolls'), 0);
});
