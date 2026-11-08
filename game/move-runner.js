import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { failure, runChecked } from './child-check.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const childEntry = resolve(repoRoot, 'quests', 'run-tests.js');

// Runs the player's exported solve() against hidden tests in a child process. Never throws.
export function runMoveTests(playerPath, tests, { timeoutMs = 5000 } = {}) {
  if (!existsSync(playerPath)) return failure('error', `Player file not found: ${playerPath}`);
  return runChecked({
    entry: childEntry,
    timeoutMs,
    input: JSON.stringify(tests),
    args: [playerPath],
  });
}

const isText = (value) => typeof value === 'string' && value.trim().length > 0;

// The Master writes the problem; this refuses any problem whose own reference solution
// does not pass its own tests, so an unsolvable problem is never shown to the player.
export function validateMoveProblem(problem, { timeoutMs = 5000 } = {}) {
  if (problem === null || typeof problem !== 'object' || Array.isArray(problem)) {
    return { ok: false, errors: ['The problem must be an object with title, brief, difficulty, tests, and reference.'] };
  }
  const errors = [];
  if (!isText(problem.title)) errors.push('The problem needs a title.');
  if (!isText(problem.brief)) errors.push('The problem needs a brief.');
  if (!Number.isInteger(problem.difficulty) || problem.difficulty < 1 || problem.difficulty > 5) {
    errors.push('difficulty must be a whole number from 1 to 5.');
  }
  if (!isText(problem.reference)) errors.push('The problem needs a reference solution (source of a module exporting solve).');

  const tests = problem.tests;
  if (!Array.isArray(tests) || tests.length < 3 || tests.length > 12) {
    errors.push('The problem needs 3 to 12 tests.');
  } else {
    tests.forEach((test, i) => {
      if (test === null || typeof test !== 'object' || !Array.isArray(test.args)) {
        errors.push(`Test ${i + 1}: args must be an array.`);
      } else if (!('expected' in test) || test.expected === undefined) {
        errors.push(`Test ${i + 1}: expected is missing.`);
      } else if (JSON.stringify(JSON.parse(JSON.stringify(test))) !== JSON.stringify(test)) {
        errors.push(`Test ${i + 1}: values must be plain JSON.`);
      }
    });
  }
  if (errors.length) return { ok: false, errors };

  const workDir = mkdtempSync(join(tmpdir(), 'jsdnd-reference-'));
  try {
    const file = join(workDir, 'reference.js');
    writeFileSync(file, problem.reference);
    const result = runMoveTests(file, tests, { timeoutMs });
    if (result.status !== 'pass') {
      const detail = result.message || `${result.expected} but ${result.got}`;
      return { ok: false, errors: [`The reference solution does not pass its own tests (${result.status}: ${detail}). Fix the problem.`] };
    }
    return { ok: true, errors: [] };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
