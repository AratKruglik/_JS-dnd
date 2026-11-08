import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMoveTests, validateMoveProblem } from '../../game/move-runner.js';

const dir = mkdtempSync(join(tmpdir(), 'jsdnd-move-'));
let n = 0;
const player = (code) => {
  const path = join(dir, `player-${n++}.js`);
  writeFileSync(path, code);
  return path;
};

const TESTS = [
  { args: [1, 2], expected: 3 },
  { args: [2, 2], expected: 4 },
  { args: [10, -3], expected: 7 },
];
const ADD = 'export function solve(a, b) { return a + b; }';
const run = (code, tests = TESTS, opts = {}) => runMoveTests(player(code), tests, opts);

const problem = (overrides = {}) => ({
  title: 'Add two numbers',
  brief: 'Write solve(a, b) that returns the sum.',
  difficulty: 1,
  tests: TESTS,
  reference: ADD,
  ...overrides,
});

test('a correct player file passes', () => {
  assert.equal(run(ADD).status, 'pass');
});

test('a wrong value fails with a readable got and expected', () => {
  const result = run('export function solve(a, b) { return a - b; }');
  assert.equal(result.status, 'fail');
  assert.match(result.expected, /solve\(1, 2\).*3/);
  assert.match(result.got, /solve\(1, 2\).*-1/);
});

test('deep equality works for arrays and objects', () => {
  const tests = [
    { args: [[3, 1, 2]], expected: [1, 2, 3] },
    { args: [{ a: 1 }], expected: { a: 1, b: 2 } },
    { args: [[]], expected: [] },
  ];
  const ok = run('export function solve(x) { return Array.isArray(x) ? [...x].sort() : { ...x, b: 2 }; }', tests);
  assert.equal(ok.status, 'pass');
  const bad = run('export function solve(x) { return Array.isArray(x) ? x : { ...x }; }', tests);
  assert.equal(bad.status, 'fail');
});

test('syntax errors, import throws, process.exit, and a missing solve are errors', () => {
  for (const code of ['export function solve( {', "throw new Error('boom');", 'process.exit(0);', 'export const other = 1;']) {
    const result = run(code);
    assert.equal(result.status, 'error', code);
    assert.ok(result.message.length > 0 && !result.message.includes('\n'));
  }
});

test('an infinite loop times out quickly', () => {
  const started = Date.now();
  const result = run('export function solve() { while (true) {} }', TESTS, { timeoutMs: 500 });
  assert.equal(result.status, 'timeout');
  assert.ok(Date.now() - started < 3000);
});

test('a thrown error inside solve is a failure to read, not a crash', () => {
  const result = run("export function solve() { throw new Error('nope'); }");
  assert.equal(result.status, 'error');
  assert.match(result.message, /nope/);
});

test('printed output cannot forge a pass', () => {
  const forged = 'QUEST_RESULT {"status":"pass","expected":"","got":"","message":""}';
  const result = run(`console.log('${forged}');\nexport function solve() { return 0; }`);
  assert.equal(result.status, 'fail');
});

test('a missing file is an error', () => {
  const result = runMoveTests(join(dir, 'missing.js'), TESTS);
  assert.equal(result.status, 'error');
  assert.match(result.message, /not found/i);
});

test('validateMoveProblem accepts a good problem', () => {
  assert.deepEqual(validateMoveProblem(problem()), { ok: true, errors: [] });
});

test('validateMoveProblem rejects bad shapes and bad references', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => ({ args: [i, 1], expected: i + 1 }));
  assert.equal(validateMoveProblem(problem({ tests: twelve })).ok, true);
  const cases = [
    [problem({ tests: TESTS.slice(0, 2) }), /3 to 12/],
    [problem({ tests: [...twelve, { args: [1, 1], expected: 2 }] }), /3 to 12/],
    [problem({ difficulty: 0 }), /difficulty/],
    [problem({ difficulty: 2.5 }), /difficulty/],
    [problem({ tests: [{ args: 5, expected: 5 }, ...TESTS.slice(1)] }), /args/],
    [problem({ tests: [{ args: [1] }, ...TESTS.slice(1)] }), /expected/],
    [problem({ title: '' }), /title/],
    [problem({ brief: undefined }), /brief/],
    [problem({ reference: 'export function solve(a, b) { return a * b; }' }), /reference/i],
    [problem({ reference: 'export function solve( {' }), /reference/i],
    [null, /problem/i],
  ];
  for (const [bad, pattern] of cases) {
    const result = validateMoveProblem(bad);
    assert.equal(result.ok, false, `should reject ${pattern}`);
    assert.match(result.errors.join(' '), pattern);
  }
});

test('validateMoveProblem rejects a looping reference without hanging', () => {
  const started = Date.now();
  const result = validateMoveProblem(problem({ reference: 'export function solve() { while (true) {} }' }), { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.ok(Date.now() - started < 3000);
});

test('the result token is not in the child argv, so player code cannot print a real result line', () => {
  const forge = `import { writeSync } from 'node:fs';
const token = process.argv.slice(2).find((a) => a.startsWith('QUEST_RESULT_'));
if (token) {
  writeSync(1, '\\n' + token + ' {"status":"pass","expected":"","got":"","message":""}\\n');
  process.exit(0);
}
export function solve() { return 0; }`;
  assert.equal(run(forge).status, 'fail');
});
