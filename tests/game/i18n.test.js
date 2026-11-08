import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_NAMES,
  createTranslator,
  getLanguage,
  setLanguage,
  effectiveLanguage,
} from '../../game/i18n.js';
import { createSave } from '../../game/hero.js';
import { freshDb } from './helpers.js';

const catalogs = {
  en: {
    hello: 'Hello, {name}!',
    items: { one: '{count} item', other: '{count} items' },
    onlyEnglish: 'Only in English',
    twoParams: '{a} and {b}',
  },
  uk: {
    hello: 'Привіт, {name}!',
    items: { one: '{count} річ', few: '{count} речі', many: '{count} речей', other: '{count} речі' },
    twoParams: '{a} і {b}',
  },
};

const withStrict = (fn) => {
  const before = process.env.JSDND_I18N_STRICT;
  process.env.JSDND_I18N_STRICT = '1';
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env.JSDND_I18N_STRICT;
    else process.env.JSDND_I18N_STRICT = before;
  }
};

test('the languages are English and Ukrainian, English is the default, and both have a name', () => {
  assert.deepEqual(LANGUAGES, ['en', 'uk']);
  assert.equal(DEFAULT_LANGUAGE, 'en');
  assert.deepEqual(LANGUAGE_NAMES, { en: 'English', uk: 'Українська' });
});

test('t looks a key up in the language and fills the placeholders', () => {
  const { t } = createTranslator(catalogs);
  assert.equal(t('en', 'hello', { name: 'Bilbo' }), 'Hello, Bilbo!');
  assert.equal(t('uk', 'hello', { name: 'Більбо' }), 'Привіт, Більбо!');
  assert.equal(t('uk', 'twoParams', { a: 1, b: 2 }), '1 і 2');
});

test('plural entries follow the rules of the language for 1, 2, 5, 11, 12, 21, 22, 25, 100, and 101', () => {
  const { t } = createTranslator(catalogs);
  const uk = (count) => t('uk', 'items', { count });
  assert.equal(uk(1), '1 річ');
  assert.equal(uk(2), '2 речі');
  assert.equal(uk(5), '5 речей');
  assert.equal(uk(11), '11 речей');
  assert.equal(uk(12), '12 речей');
  assert.equal(uk(21), '21 річ');
  assert.equal(uk(22), '22 речі');
  assert.equal(uk(25), '25 речей');
  assert.equal(uk(100), '100 речей');
  assert.equal(uk(101), '101 річ');
  assert.equal(t('en', 'items', { count: 1 }), '1 item');
  assert.equal(t('en', 'items', { count: 2 }), '2 items');
});

test('a missing key falls back to English and tells the handler, so a test can see it', () => {
  const { t, setMissingHandler } = createTranslator(catalogs);
  const seen = [];
  setMissingHandler((miss) => seen.push(miss));
  assert.equal(t('uk', 'onlyEnglish'), 'Only in English');
  assert.deepEqual(seen, [{ lang: 'uk', key: 'onlyEnglish' }]);
  assert.equal(t('uk', 'nowhere'), 'nowhere');
  setMissingHandler(null);
  assert.doesNotThrow(() => t('uk', 'onlyEnglish'));
});

test('a placeholder with no value is left visible for the player, never a crash', () => {
  const { t } = createTranslator(catalogs);
  assert.equal(t('en', 'hello'), 'Hello, {name}!');
});

test('strict mode throws on a missing key and on a missing placeholder', () => {
  const { t } = createTranslator(catalogs);
  withStrict(() => {
    assert.throws(() => t('uk', 'onlyEnglish'), /missing translation/i);
    assert.throws(() => t('en', 'nowhere'), /missing translation/i);
    assert.throws(() => t('en', 'hello'), /placeholder/i);
    assert.throws(() => t('en', 'items'), /count/i);
  });
});

test('an unknown language is an error, not a silent English', () => {
  const { t } = createTranslator(catalogs);
  assert.throws(() => t('de', 'hello', { name: 'x' }), /unknown language/i);
});

test('a new save has no language, it behaves as English, and the choice round trips through the database', () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  assert.equal(getLanguage(db, saveId), null);
  assert.equal(effectiveLanguage(db, saveId), 'en');
  setLanguage(db, saveId, 'uk');
  assert.equal(getLanguage(db, saveId), 'uk');
  assert.equal(effectiveLanguage(db, saveId), 'uk');
  setLanguage(db, saveId, 'en');
  assert.equal(getLanguage(db, saveId), 'en');
});

test('a bad language code or a missing save is rejected and nothing changes', () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  assert.throws(() => setLanguage(db, saveId, 'de'), /unknown language/i);
  assert.throws(() => setLanguage(db, saveId, undefined), /unknown language/i);
  assert.throws(() => setLanguage(db, 999, 'uk'), /no save/i);
  assert.equal(getLanguage(db, saveId), null);
  assert.throws(() => db.prepare("UPDATE saves SET language = 'de' WHERE id = ?").run(saveId), /constraint/i);
});
