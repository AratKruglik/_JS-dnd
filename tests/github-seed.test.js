import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backlogRows = readFileSync(join(root, 'dev/github/backlog.tsv'), 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '');

const countLines = (text, needle) => text.split('\n').filter((l) => l.includes(needle)).length;

test('seed.sh dry run prints one gh issue create per backlog row and never calls gh', () => {
  const fakeDir = mkdtempSync(join(tmpdir(), 'jsdnd-fakegh-'));
  const record = join(fakeDir, 'calls.txt');
  const fakeGh = join(fakeDir, 'gh');
  writeFileSync(fakeGh, `#!/bin/sh\necho "$@" >> "${record}"\n`);
  chmodSync(fakeGh, 0o755);

  const result = spawnSync('/bin/bash', [join(root, 'dev/github/seed.sh')], {
    cwd: root,
    env: { ...process.env, PATH: `${fakeDir}:${process.env.PATH}` },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(record), false, 'gh must not be called in a dry run');
  assert.equal(countLines(result.stdout, 'gh issue create'), backlogRows.length);
  assert.equal(countLines(result.stdout, 'gh project create'), 1);
  assert.equal(countLines(result.stdout, 'gh label create'), 9);
});

test('seed.sh --apply reuses an existing project and issues instead of duplicating them', () => {
  const fakeDir = mkdtempSync(join(tmpdir(), 'jsdnd-fakegh-'));
  const record = join(fakeDir, 'calls.txt');
  const existing = join(fakeDir, 'existing-issues.tsv');
  const lines = backlogRows.map((row, i) => `${row.split('\t')[0]}\thttps://example.test/issues/${i + 1}`);
  writeFileSync(existing, `${lines.join('\n')}\n`);
  const fakeGh = join(fakeDir, 'gh');
  writeFileSync(
    fakeGh,
    `#!/bin/sh
case "$1 $2" in
  "project list") echo 3 ;;
  "issue list") cat "${existing}" ;;
  *) echo "$@" >> "${record}" ;;
esac
`,
  );
  chmodSync(fakeGh, 0o755);

  const result = spawnSync('/bin/bash', [join(root, 'dev/github/seed.sh'), '--apply'], {
    cwd: root,
    env: { ...process.env, PATH: `${fakeDir}:${process.env.PATH}` },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(record, 'utf8');
  assert.equal(calls.includes('issue create'), false, 'must not create duplicate issues');
  assert.equal(calls.includes('project create'), false, 'must not create a duplicate project');
});
