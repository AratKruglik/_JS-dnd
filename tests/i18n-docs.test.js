import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import catalog, { pack, names } from '../game/locales/uk.js';
import questText from '../quests/text/uk.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checklist = readFileSync(join(root, 'docs', 'i18n', 'uk-review-checklist.md'), 'utf8');

test('the review checklist names every Ukrainian file Gogi has to read', () => {
  for (const file of ['game/locales/uk.js', 'quests/text/uk.js', 'setup.sh', 'README.uk.md']) {
    assert.ok(checklist.includes(file), `${file} is missing from the checklist`);
  }
});

test('the review checklist lists every pack area and race and class names', () => {
  for (const area of Object.keys(pack)) assert.ok(checklist.includes(`pack.${area}`), `pack.${area} is missing`);
  for (const area of Object.keys(names)) assert.ok(checklist.includes(`names.${area}`), `names.${area} is missing`);
});

test('the review checklist covers every key group of the Ukrainian catalog and every quest', () => {
  const groups = new Set(Object.keys(catalog).map((key) => key.split('.')[0]));
  assert.ok(groups.size >= 5);
  for (const group of groups) assert.ok(checklist.includes(`\`${group}.\``), `the ${group}. keys are missing`);
  for (const id of Object.keys(questText.quests)) assert.ok(checklist.includes(id), `quest ${id} is missing`);
});

test('the review checklist states the guard gap and has no long dash', () => {
  assert.match(checklist, /single word/i);
  assert.match(checklist, /CLI error text/);
  for (const dash of [String.fromCharCode(0x2013), String.fromCharCode(0x2014)]) assert.ok(!checklist.includes(dash));
});
