import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANNED_PHRASES, lintVoice } from '../../game/voice.js';
import { pack as ukPack } from '../../game/locales/uk.js';

test('every banned phrase is lowercase and at least two words', () => {
  assert.ok(BANNED_PHRASES.length >= 8);
  for (const phrase of BANNED_PHRASES) {
    assert.equal(phrase, phrase.toLowerCase());
    assert.ok(phrase.split(' ').length >= 2, `"${phrase}" is a single word`);
  }
});

test('lintVoice catches banned phrases in any case and spacing', () => {
  assert.deepEqual(lintVoice('GREAT   QUESTION, traveler.'), { ok: false, hits: ['great question'] });
  assert.equal(lintVoice('As an\nAI, I cannot').ok, false);
  assert.equal(lintVoice('I’d be happy to help you.').ok, false);
  assert.equal(lintVoice("It's   important to note the bridge is out.").ok, false);
  const two = lintVoice('Feel free to delve into the cellar.');
  assert.deepEqual(two.hits.sort(), ['delve into', 'feel free to']);
});

test('lintVoice leaves ordinary fantasy prose alone', () => {
  const prose =
    "The old tapestry on the wall hid a draft. 'Certainly,' said the innkeeper, 'but delve deeper if you dare. " +
    "Feel the cold? It's the cellar.' The note on the table read: important, burn after reading.";
  assert.deepEqual(lintVoice(prose), { ok: true, hits: [] });
});

test('lintVoice handles non-strings without throwing', () => {
  for (const bad of [undefined, null, 42, {}]) {
    assert.deepEqual(lintVoice(bad), { ok: true, hits: [] });
  }
});

test('banned phrases only match whole words, so ordinary prose is not flagged by accident', () => {
  assert.deepEqual(lintVoice('He served as an aide to the queen and later as an airship pilot.'), {
    ok: true,
    hits: [],
  });
  assert.equal(lintVoice('As an AI, I cannot say.').ok, false);
  assert.equal(lintVoice('as an ai').ok, false);
  assert.equal(lintVoice('Great question!').ok, false);
});

test('English lint ignores the Ukrainian list, and Ukrainian lint catches the Ukrainian list in any case', () => {
  assert.equal(lintVoice('Чудове запитання, мандрівнику.').ok, true);
  assert.deepEqual(lintVoice('Чудове запитання, мандрівнику.', 'uk'), { ok: false, hits: ['чудове запитання'] });
  assert.deepEqual(lintVoice('ЧУДОВЕ   ЗАПИТАННЯ!', 'uk').hits, ['чудове запитання']);
  assert.equal(lintVoice('Не соромтеся питати.', 'uk').ok, false);
});

test('English chatbot phrases are still caught inside Ukrainian text', () => {
  assert.deepEqual(lintVoice('Привіт. As an AI, я не можу.', 'uk').hits, ['as an ai']);
});

test('a Ukrainian phrase inside a longer word is not a hit, so the match is whole words only', () => {
  assert.equal(lintVoice('Це як мовна модельна лінійка.', 'uk').ok, true);
  assert.equal(lintVoice('Це якмовна модель.', 'uk').ok, true);
  assert.equal(lintVoice('Це як мовна модель.', 'uk').ok, false);
});

test('apostrophe variants and curly quotes all match, in both languages', () => {
  for (const apostrophe of [
    "'",
    String.fromCharCode(0x2019),
    String.fromCharCode(0x2018),
    String.fromCharCode(0x02bc),
    '`',
  ]) {
    assert.equal(lintVoice(`I${apostrophe}d be happy to help`).ok, false, apostrophe);
  }
});

test('every Ukrainian banned phrase is lowercase, Cyrillic, and at least two words', () => {
  assert.ok(ukPack.bannedPhrases.length >= 10);
  for (const phrase of ukPack.bannedPhrases) {
    assert.equal(phrase, phrase.toLowerCase());
    assert.ok(phrase.split(' ').length >= 2, `"${phrase}" is a single word`);
    assert.doesNotMatch(phrase, /[A-Za-z]/, phrase);
  }
});

test('every Ukrainian banned phrase is found by the Ukrainian lint', () => {
  for (const phrase of ukPack.bannedPhrases) {
    assert.deepEqual(lintVoice(`Знову ${phrase}, друже.`, 'uk').hits, [phrase], phrase);
  }
});
