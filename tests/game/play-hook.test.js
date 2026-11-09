import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGameDb } from '../../game/db.js';
import { createSave, createHeroFromChoices } from '../../game/hero.js';
import { setSetting, fillWorld } from '../../game/world.js';
import { sealDice } from '../../game/integrity.js';
import { SETTING, goodWorld } from './world-fixtures.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HERO = { name: 'Bilbo', race: 'hobbit', heroClass: 'rogue', scores: [8, 15, 14, 8, 8, 15] };

function install({ ready = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-hook-'));
  const env = {
    ...process.env,
    JSDND_GAME_DB: join(dir, 'game.db'),
    JSDND_DICE_PATH: join(dir, 'dice.js'),
    JSDND_ROLLS_PATH: join(dir, 'rolls.js'),
    JSDND_DICE_SEAL: join(dir, 'dice.sha256'),
  };
  copyFileSync(join(root, 'game', 'dice.js'), env.JSDND_DICE_PATH);
  copyFileSync(join(root, 'game', 'rolls.js'), env.JSDND_ROLLS_PATH);
  sealDice(env.JSDND_DICE_PATH, env.JSDND_DICE_SEAL, env.JSDND_ROLLS_PATH);
  if (ready) {
    const db = openGameDb(env.JSDND_GAME_DB);
    const saveId = createSave(db, { name: 'Save 1' });
    createHeroFromChoices(db, saveId, HERO);
    setSetting(db, saveId, SETTING);
    fillWorld(db, saveId, goodWorld());
    db.close();
  }
  const hook = (payload) =>
    spawnSync('node', [join(root, 'game', 'play-hook.js')], {
      env,
      encoding: 'utf8',
      input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    });
  const cli = (...args) => spawnSync('node', [join(root, 'game', 'cli.js'), ...args], { env, encoding: 'utf8' });
  return { env, hook, cli };
}

const prompt = (sessionId, text) => ({ session_id: sessionId, hook_event_name: 'UserPromptSubmit', prompt: text });

test('the hook stays silent in a session that never ran /play', () => {
  const { hook } = install();
  const result = hook(prompt('dev-session', 'fix the tests'));
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('after /play every prompt gets one state line, and only in that session', () => {
  const { hook } = install();
  assert.equal(hook(prompt('game', '/play')).stdout, '');
  const line = hook(prompt('game', 'I walk to the market')).stdout.trim();
  assert.match(
    line,
    /^\[game\] at Place 1 \(L1\) \| HP \d+\/\d+ \| 0 gold \| quests 0\/\d+, next dice-roll \| no fight \| stamina \w+ \| honor 0$/,
  );
  assert.equal(hook(prompt('other', 'hello')).stdout, '');
});

test('a compaction in a /play session brings the full state back', () => {
  const { hook } = install();
  hook(prompt('game', '/play'));
  const text = hook({ session_id: 'game', hook_event_name: 'SessionStart', source: 'compact' }).stdout;
  const state = JSON.parse(text.slice(text.indexOf('{')));
  assert.equal(state.setting.name, SETTING.name);
  assert.equal(state.here.location.slot, 'L1');
});

test('the hook prints nothing before the hero and world exist, and never fails on bad input', () => {
  const { hook } = install({ ready: false });
  hook(prompt('game', '/play'));
  assert.equal(hook(prompt('game', 'hi')).stdout, '');
  const bad = hook('not json');
  assert.equal(bad.status, 0);
  assert.equal(bad.stdout, '');
});

test('resume starts a save on a fresh install and returns the whole state in one line', () => {
  const { cli } = install({ ready: false });
  const result = cli('resume');
  assert.equal(result.status, 0);
  const state = JSON.parse(result.stdout);
  assert.equal(state.ok, true);
  assert.equal(state.hero, null);
  assert.equal(state.world.complete, false);
  assert.equal(state.here, null);
});

test('resume never exits non-zero, so it cannot abort the /play skill', () => {
  const { cli } = install();
  assert.equal(cli('resume', 'extra').status, 0);
  assert.equal(JSON.parse(cli('resume', 'extra').stdout).ok, false);
});
