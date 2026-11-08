import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave } from '../../game/hero.js';
import { migrate } from '../../game/db.js';
import { recordReading, touchWindow, currentStamina, WINDOW_MS } from '../../game/stamina.js';
import { freshDb } from './helpers.js';

const T0 = Date.UTC(2026, 10, 8, 12, 0, 0);
const MIN = 60 * 1000;
const secs = (ms) => Math.floor(ms / 1000);

function setup() {
  const db = freshDb();
  return { db, saveId: createSave(db, {}) };
}

test('a fresh reading is used as it is', () => {
  const { db, saveId } = setup();
  recordReading(db, saveId, { usedPercent: 42, resetsAt: secs(T0 + 3 * 60 * MIN) }, T0);
  const s = currentStamina(db, saveId, T0 + 5 * MIN);
  assert.deepEqual([s.usedPercent, s.estimated, s.band, s.collapsed], [42, false, 'fresh', false]);
});

test('a stale reading whose window is still open is still the best data, marked as estimated', () => {
  const { db, saveId } = setup();
  touchWindow(db, saveId, T0);
  recordReading(db, saveId, { usedPercent: 90, resetsAt: secs(T0 + 3 * 60 * MIN) }, T0);
  const s = currentStamina(db, saveId, T0 + 16 * MIN);
  assert.deepEqual([s.usedPercent, s.estimated, s.collapsed], [90, true, false]);
});

test('a stale low reading is not turned into a collapse by a long game-time window', () => {
  const { db, saveId } = setup();
  touchWindow(db, saveId, T0);
  const later = T0 + 295 * MIN;
  recordReading(db, saveId, { usedPercent: 20, resetsAt: secs(later + 120 * MIN) }, later - 17 * MIN);
  const s = currentStamina(db, saveId, later);
  assert.deepEqual([s.usedPercent, s.collapsed], [20, false]);
});

test('a stale 99 percent reading still collapses while its window is open', () => {
  const { db, saveId } = setup();
  recordReading(db, saveId, { usedPercent: 99, resetsAt: secs(T0 + 180 * MIN) }, T0);
  assert.equal(currentStamina(db, saveId, T0 + 16 * MIN).collapsed, true);
});

test('a reading is fresh at exactly 15 minutes and estimated one millisecond later', () => {
  const { db, saveId } = setup();
  recordReading(db, saveId, { usedPercent: 40, resetsAt: secs(T0 + 180 * MIN) }, T0);
  assert.equal(currentStamina(db, saveId, T0 + 15 * MIN).estimated, false);
  assert.equal(currentStamina(db, saveId, T0 + 15 * MIN + 1).estimated, true);
});

test('a reading from the future (the clock moved back) is ignored', () => {
  const { db, saveId } = setup();
  recordReading(db, saveId, { usedPercent: 99, resetsAt: secs(T0 + 24 * 60 * MIN) }, T0 + 20 * 60 * MIN);
  const s = currentStamina(db, saveId, T0);
  assert.deepEqual([s.estimated, s.collapsed, s.usedPercent], [true, false, 0]);
});

test('a resets_at that is not within the next 6 hours (milliseconds by mistake, or absurd) is ignored', () => {
  const { db, saveId } = setup();
  for (const bad of [T0 + 3 * 60 * MIN, 1e308, secs(T0) + 7 * 3600]) {
    recordReading(db, saveId, { usedPercent: 99, resetsAt: bad }, T0);
    const s = currentStamina(db, saveId, T0 + MIN);
    assert.deepEqual(
      [s.estimated, s.collapsed, Number.isFinite(s.hours), s.hours <= 5],
      [true, false, true, true],
      String(bad),
    );
  }
});

test('a reading whose window has reset falls back to the estimate', () => {
  const { db, saveId } = setup();
  recordReading(db, saveId, { usedPercent: 99, resetsAt: secs(T0 + 2 * MIN) }, T0);
  const s = currentStamina(db, saveId, T0 + 3 * MIN);
  assert.equal(s.estimated, true);
  assert.equal(s.collapsed, false);
});

test('with no row at all the estimate starts at zero', () => {
  const { db, saveId } = setup();
  const s = currentStamina(db, saveId, T0);
  assert.deepEqual([s.usedPercent, s.estimated, s.hours], [0, true, 5]);
});

test('touchWindow starts a window, keeps it for 5 hours, then starts a new one', () => {
  const { db, saveId } = setup();
  touchWindow(db, saveId, T0);
  touchWindow(db, saveId, T0 + 2 * 60 * MIN);
  assert.equal(currentStamina(db, saveId, T0 + 150 * MIN).usedPercent, 50);
  touchWindow(db, saveId, T0 + WINDOW_MS + MIN);
  assert.equal(currentStamina(db, saveId, T0 + WINDOW_MS + MIN).usedPercent, 0);
});

test('a reading never moves the estimate window, and saves are independent', () => {
  const { db, saveId } = setup();
  touchWindow(db, saveId, T0);
  recordReading(db, saveId, { usedPercent: 10, resetsAt: secs(T0 + 60 * MIN) }, T0 + MIN);
  assert.equal(db.prepare('SELECT window_started_at AS w FROM stamina WHERE save_id = ?').get(saveId).w, T0);
  const other = createSave(db, {});
  assert.equal(currentStamina(db, other, T0).estimated, true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stamina').get().n, 1);
  recordReading(db, saveId, { usedPercent: 20, resetsAt: secs(T0 + 60 * MIN) }, T0 + 2 * MIN);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stamina').get().n, 1);
});

test('a fresh reading at 99 percent collapses and counts hours from resets_at', () => {
  const { db, saveId } = setup();
  recordReading(db, saveId, { usedPercent: 99, resetsAt: secs(T0 + 150 * MIN) }, T0);
  const s = currentStamina(db, saveId, T0 + MIN);
  assert.deepEqual([s.collapsed, s.hours], [true, 3]);
});

test('hours is at least 1 even a second before the reset', () => {
  const { db, saveId } = setup();
  recordReading(db, saveId, { usedPercent: 99, resetsAt: secs(T0 + 5000) }, T0);
  assert.equal(currentStamina(db, saveId, T0).hours, 1);
});

test('migration 9 applies on top of a version 8 database', () => {
  const { db } = setup();
  db.exec('DROP TABLE stamina');
  db.exec('DELETE FROM schema_migrations WHERE version = 9');
  migrate(db);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'stamina'").get().n, 1);
});

test('the estimate window turns over at exactly 5 hours', () => {
  const { db, saveId } = setup();
  touchWindow(db, saveId, T0);
  assert.equal(Math.round(currentStamina(db, saveId, T0 + WINDOW_MS - 1).usedPercent), 100);
  assert.equal(currentStamina(db, saveId, T0 + WINDOW_MS).usedPercent, 0);
  touchWindow(db, saveId, T0 + WINDOW_MS);
  assert.equal(
    db.prepare('SELECT window_started_at AS w FROM stamina WHERE save_id = ?').get(saveId).w,
    T0 + WINDOW_MS,
  );
});
