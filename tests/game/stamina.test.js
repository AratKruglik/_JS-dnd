import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePayload, bandFor, renderBar, barColor, COLLAPSE_AT, WINDOW_MS } from '../../game/stamina.js';

test('bands change exactly at 60, 80, 95 and the collapse at 98', () => {
  const at = (p) => bandFor(p);
  assert.deepEqual([at(0).attack, at(59.9).attack, at(59.9).ac], [0, 0, 0]);
  assert.deepEqual([at(60).band, at(60).attack, at(60).ac, at(79.9).attack], ['tired', -1, -1, -1]);
  assert.deepEqual([at(80).band, at(80).attack, at(94.9).attack], ['weary', -2, -2]);
  assert.deepEqual([at(95).band, at(95).attack, at(97.9).attack, at(97.9).collapsed], ['spent', -3, -3, false]);
  assert.deepEqual([at(98).band, at(98).collapsed, at(100).collapsed], ['collapsed', true, true]);
  assert.equal(COLLAPSE_AT, 98);
  assert.equal(WINDOW_MS, 5 * 60 * 60 * 1000);
});

test('mental tiredness starts with the physical one at 60', () => {
  assert.equal(bandFor(59.9).mental, false);
  assert.equal(bandFor(60).mental, true);
});

test('bad input never gives a penalty beyond the clamp and never throws', () => {
  for (const bad of [Number.NaN, undefined, null, {}, [], 'abc', Infinity * 0]) {
    assert.deepEqual([bandFor(bad).band, bandFor(bad).attack], ['fresh', 0], String(bad));
  }
  assert.equal(bandFor(-5).band, 'fresh');
  assert.equal(bandFor(130).band, 'collapsed');
  assert.equal(bandFor('85').band, 'weary');
});

test('parsePayload reads the five hour window and nothing else', () => {
  const payload = { rate_limits: { five_hour: { used_percentage: 23.5, resets_at: 1738425600 } } };
  assert.deepEqual(parsePayload(payload), { usedPercent: 23.5, resetsAt: 1738425600 });
  assert.equal(parsePayload({ rate_limits: { seven_day: { used_percentage: 5, resets_at: 1 } } }), null);
  assert.equal(parsePayload({}), null);
  assert.equal(parsePayload(null), null);
  assert.equal(parsePayload('x'), null);
  assert.equal(parsePayload({ rate_limits: { five_hour: { used_percentage: 'lots', resets_at: 5 } } }), null);
  assert.equal(parsePayload({ rate_limits: { five_hour: { used_percentage: 10 } } }), null);
});

test('renderBar shows stamina left on one line, marks estimates, and has no long dashes', () => {
  const now = Date.UTC(2026, 10, 8, 12, 0, 0);
  const resetsAt = (now + (2 * 60 + 13) * 60 * 1000) / 1000;
  const real = renderBar({ usedPercent: 38, resetsAt, estimated: false }, now);
  assert.equal(real, 'STAMINA [######----] 62% left | resets in 2h13m');
  const guess = renderBar({ usedPercent: 38, resetsAt, estimated: true }, now);
  assert.match(guess, /^STAMINA ~\[######----\] ~62% left \(est\.\)/);
  for (const line of [real, guess, renderBar({ usedPercent: 100, resetsAt: now / 1000 - 5, estimated: false }, now)]) {
    assert.ok(!line.includes('\n'));
    assert.ok(!line.includes(String.fromCharCode(0x2013)) && !line.includes(String.fromCharCode(0x2014)));
  }
  assert.match(renderBar({ usedPercent: 100, resetsAt: now / 1000 - 5, estimated: false }, now), /0% left/);
});

test('parsePayload rejects percentages outside 0 to 100 and non-positive reset times', () => {
  const window = (used, resets) => ({ rate_limits: { five_hour: { used_percentage: used, resets_at: resets } } });
  assert.deepEqual(parsePayload(window(0, 5)), { usedPercent: 0, resetsAt: 5 });
  assert.deepEqual(parsePayload(window(100, 5)), { usedPercent: 100, resetsAt: 5 });
  for (const [used, resets] of [[-1, 5], [100.1, 5], [130, 5], [10, 0], [10, -4], [1e308, 5], [10, 1e308]]) {
    assert.equal(parsePayload(window(used, resets)), null, `${used} ${resets}`);
  }
});

test('the bar is green from 100 to 60 left, yellow from 59 to 40, and red from 39 to 0', () => {
  const colorOf = (used) => barColor(used);
  assert.deepEqual([colorOf(0), colorOf(40), colorOf(40.4)], ['green', 'green', 'green']);
  assert.deepEqual([colorOf(40.6), colorOf(50), colorOf(60), colorOf(60.4)], ['yellow', 'yellow', 'yellow', 'yellow']);
  assert.deepEqual([colorOf(60.6), colorOf(61), colorOf(98), colorOf(100)], ['red', 'red', 'red', 'red']);
  assert.equal(colorOf(Number.NaN), 'green');
});

test('renderBar colors the whole line only when asked, and plain output has no escape codes', () => {
  const now = Date.UTC(2026, 10, 8, 12, 0, 0);
  const resetsAt = (now + 60 * 60 * 1000) / 1000;
  const ESC = String.fromCharCode(27);
  const plain = renderBar({ usedPercent: 38, resetsAt, estimated: false }, now);
  assert.ok(!plain.includes(ESC));
  const colored = (used) => renderBar({ usedPercent: used, resetsAt, estimated: false }, now, 10, { color: true });
  assert.equal(colored(38), `${ESC}[32m${plain}${ESC}[0m`);
  assert.ok(colored(50).startsWith(`${ESC}[33mSTAMINA`));
  assert.ok(colored(70).startsWith(`${ESC}[31mSTAMINA`));
  assert.ok(colored(70).endsWith(`${ESC}[0m`));
});
