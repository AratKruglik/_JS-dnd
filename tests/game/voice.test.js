import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANNED_PHRASES, lintVoice } from '../../game/voice.js';

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
