import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkStyle } from '../../game/style-check.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const installed = existsSync(join(root, 'node_modules', '.bin', 'prettier'));
const options = { skip: installed ? false : 'run npm install to enable the style checks' };
const dir = mkdtempSync(join(tmpdir(), 'jsdnd-style-'));
let n = 0;
const file = (code) => {
  const path = join(dir, `player-${n++}.js`);
  writeFileSync(path, code);
  return path;
};

const CLEAN = 'export function double(value) {\n  return value * 2;\n}\n';

test('a clean file passes with no problems', options, () => {
  assert.deepEqual(checkStyle(file(CLEAN)), { ran: true, ok: true, problems: [] });
});

test('lint rules are reported with the line, the message, and the rule', options, () => {
  const result = checkStyle(file("var x = 1;\nexport const same = x == 1;\nconsole.log('hi');\n"));
  assert.equal(result.ran, true);
  assert.equal(result.ok, false);
  const text = result.problems.join('\n');
  assert.match(text, /line 1: .*\(no-var\)/);
  assert.match(text, /line 2: .*\(eqeqeq\)/);
  assert.match(text, /line 3: .*\(no-console\)/);
});

test('formatting differences name the first line that should change', options, () => {
  const result = checkStyle(file('export const greeting = "hello"\n'));
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /formatting: line 1 should read "export const greeting = 'hello';"/);
});

test('a file in the repo player folder is checked, not skipped by an ignore file', options, () => {
  const playerDir = join(root, 'player');
  const path = join(playerDir, 'zz-style-probe.js');
  mkdirSync(playerDir, { recursive: true });
  writeFileSync(path, 'var a = 1\nexport { a };\n');
  try {
    assert.equal(checkStyle(path).ok, false);
  } finally {
    rmSync(path, { force: true });
  }
});

test('Windows line endings are not a style problem', options, () => {
  assert.equal(checkStyle(file(CLEAN.replaceAll('\n', '\r\n'))).ok, true);
});

test('a syntax error is reported as a problem, not a crash', options, () => {
  const result = checkStyle(file('export function ( {'));
  assert.equal(result.ran, true);
  assert.equal(result.ok, false);
  assert.ok(result.problems.length >= 1);
});

test('at most 10 problems are listed', options, () => {
  const lines = Array.from({ length: 25 }, (_, i) => `var v${i} = ${i};`).join('\n');
  assert.equal(checkStyle(file(`${lines}\nexport { v0 };\n`)).problems.length, 10);
});

test('missing style tools mean the check is skipped, not failed', () => {
  const emptyRoot = mkdtempSync(join(tmpdir(), 'jsdnd-notools-'));
  const result = checkStyle(file(CLEAN), { root: emptyRoot });
  assert.equal(result.ran, false);
  assert.equal(result.ok, true);
  assert.match(result.message, /npm install/);
});
