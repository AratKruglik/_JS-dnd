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

// The guard keeps player-facing English out of the code: words a player reads belong in the catalogs.
const lintText = (file, code) =>
  spawnSync(bin('eslint'), ['--stdin', '--stdin-filename', file], { cwd: root, encoding: 'utf8', input: code });

test('the text guard flags multiword English prose in a player-facing module', options, () => {
  const guarded = lintText('game/stamina.js', "export const line = 'Your hero is tired';\n");
  assert.equal(guarded.status, 1, guarded.stdout);
  assert.match(guarded.stdout, /Player-facing text belongs in the language catalogs/);
  const template = lintText('game/stamina.js', 'export const line = (n) => `You have ${n} hours left`;\n');
  assert.equal(template.status, 1, template.stdout);
});

test('the text guard lets keys, single words, Cyrillic, and code through', options, () => {
  const code = [
    "import { t } from './i18n.js';",
    "export const a = (lang) => t(lang, 'stamina.bar.label');",
    "export const b = 'pass';",
    "export const c = 'Українська мова гри';",
    'export const d = `${1}%`;',
    "export const e = 'a-b';",
    '',
  ].join('\n');
  const result = lintText('game/stamina.js', code);
  assert.equal(result.status, 0, result.stdout);
});

test('the text guard only watches the listed player-facing modules', options, () => {
  const prose = "export const line = 'Your hero is tired';\n";
  assert.equal(lintText('game/db.js', prose).status, 0);
  assert.equal(lintText('game/locales/en.js', prose).status, 0);
  assert.equal(lintText('quests/text/en.js', prose).status, 0);
});

test('every listed player-facing module exists, and the ones that show text are on the list', async () => {
  const { playerFacing } = await import('../eslint.config.js');
  assert.ok(playerFacing.length >= 8);
  for (const file of playerFacing) assert.ok(existsSync(join(root, file)), `${file} is listed but missing`);
  for (const file of [
    'game/ending-page.js',
    'game/stamina.js',
    'game/statusline.js',
    'game/style-check.js',
    'game/child-check.js',
    'quests/messages.js',
    'quests/dice-roll.js',
  ]) {
    assert.ok(playerFacing.includes(file), `${file} must be guarded`);
  }
});
