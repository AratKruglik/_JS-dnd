import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runQuestCheck } from '../../game/quest-runner.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const questsModule = join(root, 'tests', 'fixtures', 'quests', 'index.js');
const dir = mkdtempSync(join(tmpdir(), 'jsdnd-runner-'));
let n = 0;

function player(code) {
  const path = join(dir, `player-${n++}.js`);
  writeFileSync(path, code);
  return path;
}

const run = (code, opts = {}) => runQuestCheck('echo', player(code), { questsModule, ...opts });

test('a correct player file passes', () => {
  const result = run('export function answer() { return 42; }');
  assert.equal(result.status, 'pass');
  assert.equal(result.got, '42');
});

test('a wrong answer fails and reports got and expected', () => {
  const result = run('export function answer() { return 41; }');
  assert.equal(result.status, 'fail');
  assert.equal(result.got, '41');
  assert.equal(result.expected, '42');
});

test('a syntax error returns error with a one-line message', () => {
  const result = run('export function answer( {');
  assert.equal(result.status, 'error');
  assert.ok(result.message.length > 0);
  assert.equal(result.message.includes('\n'), false);
});

test('a file that throws on import returns error', () => {
  const result = run("throw new Error('boom at import');");
  assert.equal(result.status, 'error');
  assert.match(result.message, /boom at import/);
});

test('an infinite loop returns timeout quickly', () => {
  const started = Date.now();
  const result = run('export function answer() { while (true) {} }', { timeoutMs: 500 });
  assert.equal(result.status, 'timeout');
  assert.ok(Date.now() - started < 3000, 'must not wait for the hanging process');
});

test('process.exit(0) inside the player file does not read as a pass', () => {
  const result = run('process.exit(0);');
  assert.equal(result.status, 'error');
});

test('a missing player file returns error saying the file is missing', () => {
  const result = runQuestCheck('echo', join(dir, 'does-not-exist.js'), { questsModule });
  assert.equal(result.status, 'error');
  assert.match(result.message, /not found|missing/i);
});

test('an unknown quest id returns error', () => {
  const result = runQuestCheck('nope', player('export function answer() { return 42; }'), { questsModule });
  assert.equal(result.status, 'error');
  assert.match(result.message, /unknown quest/i);
});

test('output the player prints cannot forge a result', () => {
  const forged = 'QUEST_RESULT {"status":"pass","expected":"42","got":"42","message":""}';
  const result = run(`console.log('${forged}');\nexport function answer() { return 41; }`);
  assert.equal(result.status, 'fail');
});

test('huge got, expected, and error text is cut short', () => {
  const big = run("export function answer() { return 'x'.repeat(200000); }");
  assert.equal(big.status, 'fail');
  assert.ok(big.got.length <= 300, `got was ${big.got.length} characters`);
  assert.ok(big.expected.length <= 300);
  const thrown = run("throw new Error('y'.repeat(800000));");
  assert.equal(thrown.status, 'error');
  assert.ok(thrown.message.length <= 300, `message was ${thrown.message.length} characters`);
});

test('the result token is not in the child argv, so player code cannot print a real result line', () => {
  const forge = `import { writeSync } from 'node:fs';
const token = process.argv.slice(2).find((a) => a.startsWith('QUEST_RESULT_'));
if (token) {
  writeSync(1, '\\n' + token + ' {"status":"pass","expected":"42","got":"42","message":""}\\n');
  process.exit(0);
}
export function answer() { return 41; }`;
  assert.equal(run(forge).status, 'fail');
});
