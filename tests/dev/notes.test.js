import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDevDb } from '../../dev/db.js';
import { setTask, addNote, getState, getMeta, setMeta } from '../../dev/notes.js';

const fresh = () => openDevDb(join(mkdtempSync(join(tmpdir(), 'jsdnd-')), 'dev.db'));

test('setTask upserts by issue number', () => {
  const db = fresh();
  setTask(db, { issueNumber: 7, title: 'Setup', status: 'todo' });
  setTask(db, { issueNumber: 7, title: 'Setup', status: 'in_progress' });
  const { tasks } = getState(db);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].status, 'in_progress');
});

test('addNote stores text verbatim', () => {
  const db = fresh();
  const body = 'He said "stop"\nthen 🎲 left';
  addNote(db, { issueNumber: null, kind: 'prediction', body });
  assert.equal(getState(db).predictions[0].body, body);
});

test('getState.lastCompleted is the newest completed note and null when none', () => {
  const db = fresh();
  assert.equal(getState(db).lastCompleted, null);
  setTask(db, { issueNumber: 1, title: 'A', status: 'done' });
  addNote(db, { issueNumber: 1, kind: 'completed', body: 'first' });
  addNote(db, { issueNumber: 1, kind: 'completed', body: 'second' });
  assert.equal(getState(db).lastCompleted.body, 'second');
});

test('getState.predictions returns at most 5, newest first', () => {
  const db = fresh();
  for (let i = 1; i <= 7; i++) {
    addNote(db, { issueNumber: null, kind: 'prediction', body: `p${i}` });
  }
  const { predictions } = getState(db);
  assert.equal(predictions.length, 5);
  assert.deepEqual(
    predictions.map((p) => p.body),
    ['p7', 'p6', 'p5', 'p4', 'p3'],
  );
});

test('addNote accepts a null issue and rejects an unknown issue', () => {
  const db = fresh();
  assert.ok(addNote(db, { issueNumber: null, kind: 'status', body: 'ok' }) > 0);
  assert.throws(() => addNote(db, { issueNumber: 999, kind: 'status', body: 'bad' }));
});

test('setMeta stores a value, getMeta reads it back, and a missing key is null', () => {
  const db = fresh();
  assert.equal(getMeta(db, 'board_owner'), null);
  setMeta(db, 'board_owner', 'yamnyk');
  setMeta(db, 'board_owner', 'someone');
  assert.equal(getMeta(db, 'board_owner'), 'someone');
});
