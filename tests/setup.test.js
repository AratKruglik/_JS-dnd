import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { sealDice } from '../game/integrity.js';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (env) => spawnSync('/bin/bash', [join(root, 'setup.sh')], { cwd: root, env, encoding: 'utf8' });

const gameEnv = () => ({
  ...process.env,
  JSDND_GAME_DB: join(mkdtempSync(join(tmpdir(), 'jsdnd-setup-')), 'data', 'game.db'),
});

test('setup.sh passes when node and node:sqlite work', () => {
  const result = run(gameEnv());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Setup complete/);
});

test('setup.sh creates the game DB', () => {
  const env = gameEnv();
  const result = run(env);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(env.JSDND_GAME_DB), 'game DB file should exist after setup');
  assert.match(result.stdout, /Setup complete/);
});

test('setup.sh fails with a clear message when node is missing', () => {
  const emptyDir = mkdtempSync(join(tmpdir(), 'jsdnd-nopath-'));
  const result = run({ PATH: `${emptyDir}:/bin:/usr/bin` });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node\.js/);
});

test('setup.sh explains a tampered dice file instead of blaming the folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-setup-tamper-'));
  const dicePath = join(dir, 'dice.js');
  const sealPath = join(dir, 'dice.sha256');
  copyFileSync(join(root, 'game', 'dice.js'), dicePath);
  sealDice(dicePath, sealPath);
  appendFileSync(dicePath, '\n// edited\n');
  const result = run({
    ...process.env,
    JSDND_DICE_PATH: dicePath,
    JSDND_DICE_SEAL: sealPath,
    JSDND_GAME_DB: join(dir, 'game.db'),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /dice/i);
});

const HELP = [/nvm install node/, /brew install node/, /nodejs\.org/];

test('a missing node prints how to install it for each common setup, and installs nothing', () => {
  const emptyDir = mkdtempSync(join(tmpdir(), 'jsdnd-nopath-'));
  const result = run({ PATH: `${emptyDir}:/bin:/usr/bin` });
  assert.equal(result.status, 1);
  for (const pattern of HELP) assert.match(result.stderr, pattern);
  assert.match(result.stderr, /run this script again/i);
});

test('an old node without node:sqlite names its version and prints the same install help', () => {
  const fakeBin = mkdtempSync(join(tmpdir(), 'jsdnd-oldnode-'));
  const fake = join(fakeBin, 'node');
  writeFileSync(fake, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo v18.0.0; exit 0; fi\nexit 1\n');
  chmodSync(fake, 0o755);
  const result = run({ PATH: `${fakeBin}:/bin:/usr/bin` });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /v18\.0\.0/);
  assert.match(result.stderr, /node:sqlite/);
  for (const pattern of HELP) assert.match(result.stderr, pattern);
});

// A throwaway copy of setup.sh next to a stub game, so the npm step can be seen without touching the repo.
function stubInstall() {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-npm-'));
  mkdirSync(join(dir, 'game'));
  copyFileSync(join(root, 'setup.sh'), join(dir, 'setup.sh'));
  writeFileSync(join(dir, 'game', 'cli.js'), "console.log('{}');\n");
  return dir;
}
const runIn = (dir, env) => spawnSync('/bin/bash', [join(dir, 'setup.sh')], { cwd: dir, env, encoding: 'utf8' });
const withNpm = (script) => {
  const bin = mkdtempSync(join(tmpdir(), 'jsdnd-fakebin-'));
  symlinkSync(process.execPath, join(bin, 'node'));
  if (script) {
    writeFileSync(join(bin, 'npm'), script);
    chmodSync(join(bin, 'npm'), 0o755);
  }
  return `${bin}:/bin:/usr/bin`;
};

test('setup.sh installs the style tools with npm when they are missing', () => {
  const dir = stubInstall();
  const result = runIn(dir, { PATH: withNpm(`#!/bin/sh\necho "$@" > "${dir}/npm-called"\nexit 0\n`) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Setup complete/);
  assert.ok(existsSync(join(dir, 'npm-called')), 'npm should have run');
});

test('setup.sh leaves npm alone when the style tools are already there', () => {
  const dir = stubInstall();
  mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', '.bin', 'prettier'), '');
  chmodSync(join(dir, 'node_modules', '.bin', 'prettier'), 0o755);
  const result = runIn(dir, { PATH: withNpm(`#!/bin/sh\ntouch "${dir}/npm-called"\n`) });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(dir, 'npm-called')), false);
});

test('a failing npm install only warns, and setup still completes', () => {
  const dir = stubInstall();
  const result = runIn(dir, { PATH: withNpm('#!/bin/sh\nexit 1\n') });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Setup complete/);
  assert.match(result.stderr, /style check will be skipped/i);
});

test('no npm at all only warns, and setup still completes', () => {
  const dir = stubInstall();
  const result = runIn(dir, { PATH: withNpm(null) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Setup complete/);
  assert.match(result.stderr, /npm/);
  assert.match(result.stderr, /style check will be skipped/i);
});
