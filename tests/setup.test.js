import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (env) =>
  spawnSync('/bin/bash', [join(root, 'setup.sh')], { cwd: root, env, encoding: 'utf8' });

test('setup.sh passes when node and node:sqlite work', () => {
  const result = run(process.env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Setup complete/);
});

test('setup.sh fails with a clear message when node is missing', () => {
  const emptyDir = mkdtempSync(join(tmpdir(), 'jsdnd-nopath-'));
  const result = run({ PATH: `${emptyDir}:/bin:/usr/bin` });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node\.js/);
});
