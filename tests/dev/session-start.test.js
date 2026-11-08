import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const hook = join(root, 'dev', 'session-start.js');

const runHook = (dbPath, cwd) =>
  spawnSync('node', [hook], { cwd, env: { ...process.env, JSDND_DEV_DB: dbPath }, encoding: 'utf8' });

test('session-start prints nothing and exits 0 when no dev DB exists (a player cloning the repo)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jsdnd-ss-'));
  const missing = join(tmp, 'fresh.db');
  const result = runHook(missing, tmp);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(existsSync(missing), false, 'the hook must not create a dev DB for a player');
});

test('session-start on an existing empty dev DB prints no tasks recorded and exits 0', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jsdnd-ss-'));
  const dbPath = join(tmp, 'dev.db');
  const env = { ...process.env, JSDND_DEV_DB: dbPath };
  assert.equal(spawnSync('node', [join(root, 'dev', 'cli.js'), 'status'], { cwd: tmp, env }).status, 0);
  const result = runHook(dbPath, tmp);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No tasks recorded yet/);
});

test('session-start exits 0 and prints Dev notes unavailable when the DB path is a directory', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jsdnd-ss-'));
  const dirAsDb = join(tmp, 'a-directory');
  mkdirSync(dirAsDb);
  const result = runHook(dirAsDb, tmp);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Dev notes unavailable/);
});

function configuredBoardRun(ghScript) {
  const tmp = mkdtempSync(join(tmpdir(), 'jsdnd-ssb-'));
  const dbPath = join(tmp, 'dev.db');
  const ghDir = mkdtempSync(join(tmpdir(), 'jsdnd-ssgh-'));
  writeFileSync(join(ghDir, 'gh'), `#!/bin/sh\n${ghScript}\n`);
  chmodSync(join(ghDir, 'gh'), 0o755);
  const env = { ...process.env, JSDND_DEV_DB: dbPath, PATH: `${ghDir}:${process.env.PATH}` };
  const config = spawnSync('node', [join(root, 'dev', 'cli.js'), 'board-config', 'yamnyk', '3'], { cwd: tmp, env });
  assert.equal(config.status, 0);
  return spawnSync('node', [hook], { cwd: tmp, env, encoding: 'utf8' });
}

test('session-start with a configured board still exits 0 when gh fails', () => {
  const result = configuredBoardRun('echo "not logged in" >&2; exit 4');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Board unavailable/);
});

test('session-start with a configured board prints the board items', () => {
  const fixture = join(root, 'tests', 'fixtures', 'item-list.json');
  const result = configuredBoardRun(`cat "${fixture}"`);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Plan 2: Game DB and script layer/);
});

test('session-start works from a different cwd', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jsdnd-ss-'));
  const elsewhere = mkdtempSync(join(tmpdir(), 'jsdnd-elsewhere-'));
  const dbPath = join(tmp, 'dev.db');
  const env = { ...process.env, JSDND_DEV_DB: dbPath };
  assert.equal(spawnSync('node', [join(root, 'dev', 'cli.js'), 'status'], { cwd: tmp, env }).status, 0);
  const result = runHook(dbPath, elsewhere);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Confirmed state/);
});
