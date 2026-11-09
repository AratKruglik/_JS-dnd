import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const at = (text) => {
  const index = readme.indexOf(text);
  assert.ok(index >= 0, `README.md has no "${text}"`);
  return index;
};

test('the README opens with what the game is, then how to play, then the tech stack', () => {
  const description = at('A D&D-style adventure');
  const play = at('\n## How to play');
  const stack = at('\n## Tech stack');
  assert.ok(description < play && play < stack, 'order is description, How to play, Tech stack');
  assert.match(readme.split('\n')[2], /^# JS D&D$/);
});

test('everything developer related comes after the tech stack', () => {
  const stack = at('\n## Tech stack');
  for (const heading of [
    '\n## Project status',
    '\n## Feature list',
    '\n## Try the scripts',
    '\n## Repo layout',
    '\n## How it gets built',
    '\n## Contributing',
  ]) {
    assert.ok(at(heading) > stack, `${heading.trim()} must come after Tech stack`);
  }
});

test('the license is the last section', () => {
  const headings = [...readme.matchAll(/^## .+$/gm)].map((m) => m[0]);
  assert.equal(headings.at(-1), '## License');
});

test('how to play has the player steps and the dice warning, and no developer commands', () => {
  const play = readme.slice(at('\n## How to play'), at('\n## Tech stack'));
  assert.match(play, /bash setup\.sh/);
  assert.match(play, /\/play/);
  assert.match(play, /game\/dice\.js/);
  assert.match(play, /game\/rolls\.js/);
  assert.match(play, /stamina/i);
  assert.match(play, /honor/i);
  assert.doesNotMatch(play, /node --test|npm run|dev\/cli\.js|node game\/cli\.js/);
});

test('the combat example is the real flow, not the old logging command', () => {
  assert.doesNotMatch(readme, /fight start/);
  const scripts = readme.slice(at('\n## Try the scripts'), at('\n## Repo layout'));
  assert.match(scripts, /npc warn N1/);
  assert.match(scripts, /fight begin --npc N1/);
  assert.match(scripts, /fight attack/);
});

test('the quest commands are shown after the sentence that says they need a finished world', () => {
  const scripts = readme.slice(at('\n## Try the scripts'), at('\n## Repo layout'));
  const needs = scripts.indexOf('finished world');
  const quest = scripts.indexOf('quest start dice-roll');
  assert.ok(needs >= 0 && quest > needs, 'the quest sample must come after the finished world note');
});

test('the feature list says the fingerprint covers both the dice and rolls files', () => {
  const row = readme.split('\n').find((l) => l.includes('Dice tamper detection'));
  assert.match(row, /dice and rolls/i);
});
