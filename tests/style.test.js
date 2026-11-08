import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => join(root, 'node_modules', '.bin', name);
const installed = existsSync(bin('prettier')) && existsSync(bin('eslint'));
const options = { skip: installed ? false : 'run npm install to enable the style tests' };

const run = (name, args) => spawnSync(bin(name), args, { cwd: root, encoding: 'utf8' });

test('the repo code matches the Prettier style', options, () => {
  const result = run('prettier', ['--check', '**/*.{js,json}']);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}\nRun: npm run format`);
});

test('the repo code passes ESLint', options, () => {
  const result = run('eslint', ['.']);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test('game/dice.js is never touched by the formatter or the linter', () => {
  assert.match(readFileSync(join(root, '.prettierignore'), 'utf8'), /^game\/dice\.js$/m);
  assert.match(readFileSync(join(root, 'eslint.config.js'), 'utf8'), /game\/dice\.js/);
});

test('game/rolls.js is sealed, so no formatter, linter, or line ending rule may change it', () => {
  assert.match(readFileSync(join(root, '.prettierignore'), 'utf8'), /^game\/rolls\.js$/m);
  assert.match(readFileSync(join(root, 'eslint.config.js'), 'utf8'), /game\/rolls\.js/);
  assert.match(readFileSync(join(root, '.gitattributes'), 'utf8'), /^game\/rolls\.js text eol=lf$/m);
});
