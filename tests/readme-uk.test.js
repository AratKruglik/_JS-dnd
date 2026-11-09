import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const dashes = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];

test('line one of both READMEs is the language switcher, and each links to the other', () => {
  assert.equal(read('README.md').split('\n')[0], '**English** | [Українська](README.uk.md)');
  assert.equal(read('README.uk.md').split('\n')[0], '[English](README.md) | **Українська**');
  assert.ok(existsSync(join(root, 'README.uk.md')));
});

test('the Ukrainian README is Cyrillic prose with the title, and has no long dash', () => {
  const uk = read('README.uk.md');
  assert.match(uk.split('\n')[2], /^# JS D&D$/);
  assert.ok((uk.match(/\p{Script=Cyrillic}/gu) ?? []).length > 600, 'too little Ukrainian');
  for (const dash of dashes) assert.ok(!uk.includes(dash));
});

test('the Ukrainian README follows the English order: description, how to play, requirements, license', () => {
  const uk = read('README.uk.md');
  const at = (text) => {
    const index = uk.indexOf(text);
    assert.ok(index >= 0, `README.uk.md has no "${text}"`);
    return index;
  };
  const description = at('Покрокова D&D');
  const play = at('\n## Як грати');
  const needs = at('\n## Що потрібно');
  const license = at('\n## Ліцензія');
  assert.ok(description < play && play < needs && needs < license);
  const headings = [...uk.matchAll(/^## .+$/gm)].map((m) => m[0]);
  assert.equal(headings.at(-1), '## Ліцензія');
});

test('the Ukrainian README links to the English one, names the license, and has no developer content', () => {
  const uk = read('README.uk.md');
  assert.match(uk, /\]\(README\.md\)/);
  assert.match(uk, /MIT/);
  assert.match(uk, /bash setup\.sh/);
  assert.match(uk, /\/play/);
  assert.match(uk, /game\/dice\.js/);
  assert.match(uk, /game\/rolls\.js/);
  assert.doesNotMatch(uk, /node --test|npm run|dev\/cli\.js|node game\/cli\.js|## Tech stack|## Repo layout/);
});

test('the Ukrainian README says setup asks for the language and that it can be switched', () => {
  const uk = read('README.uk.md');
  assert.match(uk, /англійською чи українською/);
  assert.match(uk, /Мову можна змінити/);
});

test('the English README tells how the language is chosen and where the Ukrainian drafts are reviewed', () => {
  const readme = read('README.md');
  assert.match(readme, /node game\/cli\.js lang set uk/);
  assert.match(readme, /docs\/i18n\/uk-review-checklist\.md/);
  assert.match(readme, /game\/locales/);
});

test('CLAUDE.md names the language commands, the catalogs, and the review gate', () => {
  const claude = read('CLAUDE.md');
  assert.match(claude, /lang show/);
  assert.match(claude, /game\/locales/);
  assert.match(claude, /quests\/text/);
  assert.match(claude, /uk-review-checklist/);
});

test('the Ukrainian README tells about the hero line, health, gold, and items', () => {
  const uk = read('README.uk.md');
  assert.match(uk, /Смуга внизу показує/);
  for (const word of ['здоровʼя', 'золото', 'предмет']) assert.ok(uk.includes(word), word);
});

test('the Ukrainian README states the Claude Code version and tells about play.sh and the models', () => {
  const uk = read('README.uk.md');
  assert.match(uk, /2\.1\.271/);
  assert.match(uk, /bash play\.sh/);
  assert.match(uk, /Sonnet/);
  assert.match(uk, /Opus/);
});
