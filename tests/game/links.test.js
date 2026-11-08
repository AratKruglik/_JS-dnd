import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLink, LEGAL_SOURCES } from '../../game/links.js';

test('each of the seven legal sources is legal', () => {
  const urls = [
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    'https://www.w3schools.com/js/',
    'https://tc39.es/ecma262/',
    'https://nodejs.org/docs/latest/api/',
    'https://fetch.spec.whatwg.org/',
    'https://javascript.info/promise-basics',
    'https://eloquentjavascript.net/11_async.html',
  ];
  assert.equal(LEGAL_SOURCES.length, 7);
  for (const url of urls) assert.equal(classifyLink(url).legal, true, `${url} should be legal`);
});

test('casing and www do not matter', () => {
  const result = classifyLink('HTTPS://WWW.W3SCHOOLS.COM/js/');
  assert.deepEqual(result, { legal: true, host: 'w3schools.com' });
});

test('lookalikes are illegal', () => {
  const urls = [
    'https://developer.mozilla.org.evil.com/',
    'https://evil.com/developer.mozilla.org',
    'https://developer.mozilla.org@evil.com/',
    'https://evil.com@developer.mozilla.org/',
    'https://notmdn.com',
    'https://tc39.es/proposal-temporal/',
  ];
  for (const url of urls) assert.equal(classifyLink(url).legal, false, `${url} should be illegal`);
});

test('non-http schemes and garbage are illegal and do not throw', () => {
  for (const bad of ['javascript:alert(1)', 'ftp://developer.mozilla.org/', '', 'not a url', undefined, null, 42]) {
    assert.deepEqual(classifyLink(bad), { legal: false, host: null });
  }
});

test('nodejs.org outside docs and api is illegal', () => {
  assert.equal(classifyLink('https://nodejs.org/en/blog/').legal, false);
  assert.equal(classifyLink('https://nodejs.org/api/fs.html').legal, true);
  assert.equal(classifyLink('https://nodejs.org/docsmith').legal, false);
});

test('other well-known sites are illegal', () => {
  const result = classifyLink('https://stackoverflow.com/questions/1');
  assert.deepEqual(result, { legal: false, host: 'stackoverflow.com' });
});

test('a legal host written without a scheme is still legal', () => {
  assert.equal(classifyLink('developer.mozilla.org/en-US/docs/Web/JavaScript').legal, true);
  assert.deepEqual(classifyLink('www.w3schools.com/js'), { legal: true, host: 'w3schools.com' });
  assert.deepEqual(classifyLink('stackoverflow.com/q/1'), { legal: false, host: 'stackoverflow.com' });
  assert.equal(classifyLink('evil.com/developer.mozilla.org').legal, false);
  assert.deepEqual(classifyLink('not a url'), { legal: false, host: null });
  assert.deepEqual(classifyLink('javascript:alert(1)'), { legal: false, host: null });
});
