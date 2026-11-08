import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGameDb } from '../../game/db.js';
import { createSave } from '../../game/hero.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = join(root, 'game', 'statusline.js');

const payload = (usedPercent = 38, minutes = 133) => ({
  rate_limits: { five_hour: { used_percentage: usedPercent, resets_at: Math.floor(Date.now() / 1000) + minutes * 60 } },
});

function runBar(input, { withSave = true, withDb = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-bar-'));
  const dbPath = join(dir, 'game.db');
  let db = null;
  if (withDb) {
    db = openGameDb(dbPath);
    if (withSave) createSave(db, {});
  }
  const started = Date.now();
  const result = spawnSync('node', [script], { env: { ...process.env, JSDND_GAME_DB: dbPath }, input, encoding: 'utf8' });
  return { result, db, dbPath, ms: Date.now() - started };
}

const oneLine = (result) => {
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^[^\n]+\n$/);
  assert.ok(!result.stdout.includes(String.fromCharCode(0x2013)) && !result.stdout.includes(String.fromCharCode(0x2014)));
  return result.stdout.trim();
};

test('a good payload is stored for the save and drawn as the bar, quickly', () => {
  const { result, db, ms } = runBar(JSON.stringify(payload()));
  assert.match(oneLine(result), /^STAMINA \[######----\] 62% left \| resets in 2h1\dm$/);
  const row = db.prepare('SELECT used_percent AS u FROM stamina WHERE save_id = 1').get();
  assert.equal(row.u, 38);
  assert.ok(ms < 2000, `took ${ms}ms`);
});

test('empty stdin, junk, and a payload without the five hour window still print one line', () => {
  for (const input of ['', 'not json', '{"rate_limits":{"seven_day":{"used_percentage":5,"resets_at":1}}}', 'null', '[]']) {
    const { result, db } = runBar(input);
    assert.match(oneLine(result), /^STAMINA ~\[/, JSON.stringify(input));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stamina WHERE used_percent IS NOT NULL').get().n, 0);
  }
});

test('with no save the bar still shows the payload and nothing is written', () => {
  const { result, db } = runBar(JSON.stringify(payload(), null, 1), { withSave: false });
  assert.match(oneLine(result), /62% left/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stamina').get().n, 0);
});

test('with no game database the bar is drawn and no database is created', () => {
  const { result, dbPath } = runBar(JSON.stringify(payload()), { withDb: false });
  assert.match(oneLine(result), /62% left/);
  assert.equal(existsSync(dbPath), false);
  assert.match(oneLine(runBar('', { withDb: false }).result), /^STAMINA unknown$/);
});

test('a locked database does not hang or break the bar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-bar-'));
  const dbPath = join(dir, 'game.db');
  const db = openGameDb(dbPath);
  createSave(db, {});
  db.exec('BEGIN IMMEDIATE');
  const started = Date.now();
  const result = spawnSync('node', [script], { env: { ...process.env, JSDND_GAME_DB: dbPath }, input: JSON.stringify(payload()), encoding: 'utf8' });
  db.exec('ROLLBACK');
  assert.match(oneLine(result), /62% left/);
  assert.ok(Date.now() - started < 3000);
});

test('the project settings point the status line at the script and keep the session hook', () => {
  const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf8'));
  assert.equal(settings.statusLine.type, 'command');
  assert.match(settings.statusLine.command, /game\/statusline\.js/);
  assert.equal(settings.statusLine.refreshInterval, 60);
  assert.ok(settings.hooks.SessionStart);
});
