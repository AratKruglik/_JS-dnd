import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HONOR_RULES, toneFor, applyHonorRule } from '../../game/honor-rules.js';
import { getHonor, getHonorHistory } from '../../game/honor.js';
import { createSave } from '../../game/hero.js';
import { freshDb, count } from './helpers.js';
import { MIGRATIONS } from '../../game/schema.js';

const setup = () => {
  const db = freshDb();
  return { db, saveId: createSave(db, {}) };
};

test('the quest tables exist after migrating and every migration is recorded', () => {
  const { db } = setup();
  const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
  assert.deepEqual(
    versions.map((v) => v.version),
    MIGRATIONS.map((m) => m.version),
  );
  for (const table of ['quest_attempts', 'quest_judgments', 'quest_solves', 'quest_hints']) {
    assert.equal(count(db, table), 0, `${table} should exist and be empty`);
  }
});

test('toneFor is gentle at 0 and above and roast below 0', () => {
  assert.equal(toneFor(-1), 'roast');
  assert.equal(toneFor(-100), 'roast');
  assert.equal(toneFor(0), 'gentle');
  assert.equal(toneFor(1), 'gentle');
  assert.equal(toneFor(100), 'gentle');
});

test('applyHonorRule applies the table delta and logs the kind', () => {
  const { db, saveId } = setup();
  assert.equal(applyHonorRule(db, saveId, 'cheat', 'hardcoded the answer'), -15);
  const last = getHonorHistory(db, saveId).at(-1);
  assert.deepEqual([last.kind, last.delta, last.reason], ['cheat', -15, 'hardcoded the answer']);
});

test('applyHonorRule clamps through addHonorEvent', () => {
  const { db, saveId } = setup();
  for (let i = 0; i < 10; i++) applyHonorRule(db, saveId, 'kill_unprovoked');
  assert.equal(getHonor(db, saveId), -100);
});

test('applyHonorRule rejects an unknown kind and writes nothing', () => {
  const { db, saveId } = setup();
  assert.throws(() => applyHonorRule(db, saveId, 'moonwalk'), /unknown honor kind/i);
  assert.equal(count(db, 'honor_events'), 0);
});

test('kill_self_defense is a valid kind that changes nothing', () => {
  const { db, saveId } = setup();
  assert.equal(HONOR_RULES.kill_self_defense, 0);
  assert.equal(applyHonorRule(db, saveId, 'kill_self_defense'), 0);
  assert.equal(count(db, 'honor_events'), 1);
});
