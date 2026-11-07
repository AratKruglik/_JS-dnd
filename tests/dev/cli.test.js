import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = join(root, 'dev', 'cli.js');

function session() {
  const tmp = mkdtempSync(join(tmpdir(), 'jsdnd-cli-'));
  const env = { ...process.env, JSDND_DEV_DB: join(tmp, 'dev.db') };
  return (...args) => spawnSync('node', [cli, ...args], { cwd: tmp, env, encoding: 'utf8' });
}

test('cli task and note then status shows them', () => {
  const run = session();
  assert.equal(run('task', '3', 'in_progress', 'Setup').status, 0);
  assert.equal(run('note', 'completed', '3', 'done X').status, 0);
  assert.equal(run('note', 'prediction', '-', 'maybe Y next').status, 0);
  const out = run('status').stdout;
  assert.match(out, /Setup/);
  assert.match(out, /done X/);
  assert.match(out, /maybe Y next/);
});

test('cli rejects an unknown status with a non-zero exit', () => {
  const run = session();
  const result = run('task', '3', 'finished', 'Setup');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /status/);
});

test('cli note for an unknown task explains how to fix it', () => {
  const run = session();
  const result = run('note', 'status', '42', 'orphan');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /task/);
});
