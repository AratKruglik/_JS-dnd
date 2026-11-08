import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import en from '../../game/locales/en.js';
import uk from '../../game/locales/uk.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Every string of a catalog, with plural entries flattened to "key.category".
function strings(catalog) {
  const out = {};
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value === 'string') out[key] = value;
    else for (const [category, text] of Object.entries(value)) out[`${key}.${category}`] = text;
  }
  return out;
}

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('both catalogs have exactly the same keys', () => {
  assert.deepEqual(Object.keys(uk).sort(), Object.keys(en).sort());
});

test('a key is plural in both languages or in neither', () => {
  for (const key of Object.keys(en)) {
    assert.equal(typeof uk[key], typeof en[key], `${key} is plural in one language only`);
  }
});

test('every plural entry in Ukrainian has all four categories, and English has one and other', () => {
  const ukCategories = new Intl.PluralRules('uk').resolvedOptions().pluralCategories.sort();
  const enCategories = new Intl.PluralRules('en').resolvedOptions().pluralCategories.sort();
  for (const [key, value] of Object.entries(uk)) {
    if (typeof value === 'string') continue;
    assert.deepEqual(Object.keys(value).sort(), ukCategories, `${key} in uk`);
  }
  for (const [key, value] of Object.entries(en)) {
    if (typeof value === 'string') continue;
    assert.deepEqual(Object.keys(value).sort(), enCategories, `${key} in en`);
  }
});

test('every string keeps the same placeholders in both languages', () => {
  const english = strings(en);
  const ukrainian = strings(uk);
  for (const key of Object.keys(en)) {
    const plain = typeof en[key] === 'string';
    const enTexts = plain ? [english[key]] : Object.values(en[key]);
    const ukTexts = plain ? [ukrainian[key]] : Object.values(uk[key]);
    const wanted = [...new Set(enTexts.flatMap(placeholders))].sort();
    for (const text of ukTexts) {
      for (const name of placeholders(text))
        assert.ok(wanted.includes(name), `${key}: {${name}} is not in the English text`);
    }
    if (!plain) continue;
    assert.deepEqual(placeholders(ukrainian[key]), placeholders(english[key]), key);
  }
});

// Latin letters are allowed in Ukrainian text only inside backticks, {placeholders}, and the bracketed
// English term that follows a JS term, like "замикання (closure)".
const withoutAllowedLatin = (text) =>
  text
    .replace(/`[^`]*`/g, '')
    .replace(/\{\w+\}/g, '')
    .replace(/\([A-Za-z][A-Za-z .,'/-]*\)/g, '');

test('Ukrainian strings carry no Latin letters outside code, placeholders, and bracketed English terms', () => {
  for (const [key, text] of Object.entries(strings(uk))) {
    assert.doesNotMatch(withoutAllowedLatin(text), /[A-Za-z]/, `${key}: "${text}"`);
  }
});

test('the allowed-Latin rule really lets those three things through and catches the rest', () => {
  assert.doesNotMatch(withoutAllowedLatin('Використайте `const` для {name}, замикання (closure)'), /[A-Za-z]/);
  assert.match(withoutAllowedLatin('Привіт, Bilbo'), /[A-Za-z]/);
  assert.match(withoutAllowedLatin('privit'), /[A-Za-z]/);
});

test('no catalog string has an em-dash or an en-dash', () => {
  const dashes = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];
  for (const [name, catalog] of [
    ['en', en],
    ['uk', uk],
  ]) {
    for (const [key, text] of Object.entries(strings(catalog))) {
      for (const dash of dashes) assert.ok(!text.includes(dash), `${name} ${key} has a long dash`);
    }
  }
});

test('the catalog files themselves have no long dash', () => {
  for (const file of ['game/locales/en.js', 'game/locales/uk.js', 'game/i18n.js']) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const code of [0x2013, 0x2014])
      assert.ok(!text.includes(String.fromCharCode(code)), `${file} has a long dash`);
  }
});
