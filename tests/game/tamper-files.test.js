import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// A throwaway copy of the game, so the real dice.js and rolls.js are never touched. The copy runs
// from its own folder, so a deleted or broken file there is a deleted or broken file for real.
function copyOfTheGame() {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-files-'));
  for (const part of ['game', 'quests', 'world', 'package.json'])
    cpSync(join(root, part), join(dir, part), { recursive: true });
  const env = { ...process.env, JSDND_GAME_DB: join(dir, 'data', 'game.db'), JSDND_PLAYER_DIR: join(dir, 'player') };
  for (const name of ['JSDND_DICE_PATH', 'JSDND_ROLLS_PATH', 'JSDND_DICE_SEAL']) delete env[name];
  const run = (...args) => {
    const result = spawnSync('node', [join(dir, 'game', 'cli.js'), ...args], { cwd: dir, env, encoding: 'utf8' });
    return { ...result, json: result.stdout.trim() ? JSON.parse(result.stdout) : null };
  };
  return { dir, run };
}

test('an untouched copy of the game runs normally', () => {
  const { run } = copyOfTheGame();
  assert.equal(run('integrity', 'check').status, 0);
});

for (const [name, damage] of [
  ['a deleted rolls.js', (dir) => rmSync(join(dir, 'game', 'rolls.js'))],
  ['a deleted dice.js', (dir) => rmSync(join(dir, 'game', 'dice.js'))],
  ['a rolls.js with a syntax error', (dir) => appendFileSync(join(dir, 'game', 'rolls.js'), '\nexport const = ;\n')],
  ['a dice.js with a syntax error', (dir) => appendFileSync(join(dir, 'game', 'dice.js'), '\nexport const = ;\n')],
]) {
  test(`${name} is tampering: exit 2 with the tamper message, not a crash`, () => {
    const { dir, run } = copyOfTheGame();
    damage(dir);
    const result = run('look');
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.json.tamper, true);
    assert.match(result.json.message, /game\/dice\.js and game\/rolls\.js/);
    assert.equal(result.stderr, '');
  });
}

test('a bad option under tampering is reported as tampering, exit 2', () => {
  const { dir, run } = copyOfTheGame();
  appendFileSync(join(dir, 'game', 'rolls.js'), '\n// rigged\n');
  assert.equal(run('roll', 'd20', '--bogus').status, 2);
});

test('an old one line seal file is reported as broken, not as tampering', () => {
  const { dir, run } = copyOfTheGame();
  writeFileSync(join(dir, 'game', 'dice.sha256'), `${'a'.repeat(64)}\n`);
  const result = run('look');
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr.trim()).error, /missing or broken/i);
});
