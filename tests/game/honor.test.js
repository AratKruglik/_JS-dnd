import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addHonorEvent, getHonor, getHonorHistory, HONOR_MIN, HONOR_MAX } from '../../game/honor.js';
import { createSave } from '../../game/hero.js';
import { freshDb, count } from './helpers.js';

const setup = () => {
  const db = freshDb();
  return { db, saveId: createSave(db, {}) };
};

test('getHonor starts at 0', () => {
  const { db, saveId } = setup();
  assert.equal(getHonor(db, saveId), 0);
});

test('addHonorEvent stores honor_after and getHonor returns the latest', () => {
  const { db, saveId } = setup();
  assert.equal(addHonorEvent(db, saveId, { delta: 10, kind: 'help', reason: 'helped the baker' }), 10);
  assert.equal(addHonorEvent(db, saveId, { delta: -4, kind: 'swear', reason: 'cursed at a guard' }), 6);
  assert.equal(getHonor(db, saveId), 6);
});

test('honor clamps at the ceiling and the floor', () => {
  const { db, saveId } = setup();
  assert.equal(HONOR_MAX, 100);
  assert.equal(HONOR_MIN, -100);
  assert.equal(addHonorEvent(db, saveId, { delta: 150, kind: 'help', reason: 'big deed' }), 100);
  assert.equal(addHonorEvent(db, saveId, { delta: -300, kind: 'kill', reason: 'unprovoked' }), -100);
  assert.deepEqual(
    getHonorHistory(db, saveId).map((e) => e.delta),
    [150, -300],
  );
});

test('delta must be a finite integer', () => {
  const { db, saveId } = setup();
  for (const delta of [Number.NaN, 1.5, Number.POSITIVE_INFINITY]) {
    assert.throws(() => addHonorEvent(db, saveId, { delta, kind: 'x', reason: 'bad' }));
  }
  assert.equal(count(db, 'honor_events'), 0);
});

test('history keeps insertion order', () => {
  const { db, saveId } = setup();
  addHonorEvent(db, saveId, { delta: 1, kind: 'a', reason: 'first' });
  addHonorEvent(db, saveId, { delta: 2, kind: 'b', reason: 'second' });
  const history = getHonorHistory(db, saveId);
  assert.deepEqual(
    history.map((e) => [e.reason, e.honorAfter]),
    [
      ['first', 1],
      ['second', 3],
    ],
  );
});
