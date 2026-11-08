import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const play = readFileSync(join(root, '.claude', 'commands', 'play.md'), 'utf8');
const claudeMd = readFileSync(join(root, 'CLAUDE.md'), 'utf8');

test('play.md has a description header for the slash command', () => {
  assert.match(play, /^---\ndescription: .+\n---\n/);
});

test('play.md walks onboarding in order and ends by looking around', () => {
  const start = play.indexOf('## Onboarding');
  const end = play.indexOf('## Playing');
  assert.ok(start >= 0 && end > start, 'Onboarding and Playing sections are missing');
  const onboarding = play.slice(start, end);
  const steps = [
    'node game/cli.js rules races',
    'node game/cli.js rules classes',
    'node game/cli.js rules pointbuy',
    'node game/cli.js hero create',
    'node game/cli.js world setting',
    'node game/cli.js world skeleton',
    'node game/cli.js world fill',
    'node game/cli.js look',
  ];
  let last = -1;
  for (const step of steps) {
    const at = onboarding.indexOf(step);
    assert.ok(at > last, `"${step}" is missing or out of order in Onboarding`);
    last = at;
  }
});

test('play.md keeps all state in scripts and says so', () => {
  assert.match(play, /never keep game state in files/i);
  assert.doesNotMatch(play, /(write|save|store) (it |the state |notes )?(to|in) (a |the )?(file|\.json|\.md)/i);
});

test('every "node game/cli.js <command>" in play.md exists in the CLI usage', () => {
  const probe = spawnSync('node', [join(root, 'game', 'cli.js')], { encoding: 'utf8' });
  const usage = JSON.parse(probe.stderr.trim()).error;
  const needsSub = new Set(['hero', 'rules', 'world', 'quest', 'link', 'honor', 'fight', 'integrity', 'voice']);
  const seen = new Set();
  for (const match of play.matchAll(/node game\/cli\.js ([a-z]+)(?: ([a-z]+))?/g)) {
    const [, command, sub] = match;
    const phrase = needsSub.has(command) ? `${command} ${sub}` : command;
    seen.add(phrase);
    assert.ok(usage.includes(phrase), `play.md uses "${phrase}" but the CLI usage does not list it`);
  }
  for (const required of ['init', 'look', 'go', 'talk', 'roll', 'quest check', 'quest judge', 'honor event', 'link use', 'voice lint']) {
    assert.ok(seen.has(required), `play.md never mentions "${required}"`);
  }
});

test('play.md covers tone, choice prompts, the dice rule, and the exit code for tampering', () => {
  assert.match(play, /gentle/);
  assert.match(play, /roast/);
  assert.match(play, /choice prompt/i);
  assert.match(play, /2 to 4 options/);
  assert.match(play, /exits? (with )?code 2/i);
  assert.match(play, /game\/dice\.js/);
});

test('play.md has no em-dash or en-dash', () => {
  assert.equal(play.includes(String.fromCharCode(0x2014)) || play.includes(String.fromCharCode(0x2013)), false);
});

test('CLAUDE.md points playing to /play and developing to the rest', () => {
  assert.match(claudeMd, /\/play/);
  assert.match(claudeMd, /Dungeon Master/);
});

test('play.md recalls the setting on resume and skips steps that are already done', () => {
  assert.match(play, /node game\/cli\.js world show/);
  assert.match(play, /skip any step that is already done/i);
  assert.match(play, /replaces the hero/i);
});

test('play.md sends the world on stdin as a heredoc so apostrophes are safe', () => {
  assert.match(play, /node game\/cli\.js world fill --data - <<'EOF'/);
  assert.match(play, /apostrophe/i);
});

test('the README try section does not tell a reader to touch the real save', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /hero new/);
  assert.match(readme, /throwaway/i);
  assert.match(readme, /JSDND_GAME_DB/);
});
