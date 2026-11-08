import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPage, escapeHtml, lineChart } from '../../game/ending-page.js';

const T = (m) => new Date(Date.UTC(2026, 10, 8, 10, m)).toISOString();
const stats = (overrides = {}) => ({
  hero: { name: 'Bilbo', race: 'halfling', heroClass: 'rogue', level: 1 },
  setting: { name: 'Neon Harbor' },
  minutes: 135,
  hoursEstimated: 2.3,
  enemiesDefeated: 4,
  fights: 5,
  falls: 1,
  tasks: {
    solved: 3,
    total: 3,
    list: [
      { id: 'dice-roll', title: 'Roll your own die', rung: 1, complexity: 2, solvedAt: T(10), hintsUsed: 0, epoch: 0 },
      { id: 'string-shout', title: 'Shout it', rung: 1, complexity: 2, solvedAt: T(40), hintsUsed: 1, epoch: 0 },
      { id: 'array-sum', title: 'Add them up', rung: 1, complexity: 3, solvedAt: T(70), hintsUsed: 0, epoch: 1 },
    ],
  },
  honor: [
    { at: T(0), honor: 5, kind: 'clean_solve', reason: 'solved dice-roll' },
    { at: T(30), honor: -100, kind: 'reset', reason: 'dice tampered' },
    { at: T(60), honor: -95, kind: 'clean_solve', reason: 'solved again' },
  ],
  complexity: [
    { at: T(10), cumulative: 2 },
    { at: T(40), cumulative: 4 },
    { at: T(70), cumulative: 7 },
  ],
  ...overrides,
});

const long = String.fromCharCode(0x2013) + String.fromCharCode(0x2014);

test('escapeHtml neutralizes markup characters and accepts non-strings', () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(42), '42');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('hostile names and honor notes cannot inject markup', () => {
  const evil = '<script>alert(1)</script>';
  const html = renderPage(
    stats({
      hero: { name: evil, race: '"><img src=x onerror=1>', heroClass: '</svg><script>x</script>', level: 1 },
      setting: { name: evil },
      honor: [{ at: T(0), honor: 5, kind: '</title><script>', reason: '</svg><script>boom()</script>' }],
    }),
  );
  assert.ok(!html.includes('<script'), 'a script tag leaked');
  assert.ok(!html.includes('<img'), 'an img tag leaked');
  assert.ok(!html.includes('</svg><'.concat('script')));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('the page is self-contained: no script, no links out, no external requests', () => {
  const html = renderPage(stats());
  assert.ok(!/<script/i.test(html));
  assert.ok(!/https?:\/\//i.test(html));
  assert.ok(!/<link|<img|src=|@import|url\(/i.test(html));
});

test('the page has the document basics and no NaN or Infinity anywhere', () => {
  const html = renderPage(stats());
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.ok(!/NaN|Infinity/.test(html));
});

test('the page shows the headline numbers and one row per solved quest', () => {
  const html = renderPage(stats());
  assert.match(html, /Bilbo/);
  assert.match(html, /Neon Harbor/);
  assert.match(html, /2h 15m/);
  assert.match(html, /estimated/i);
  assert.match(html, /3 of 3/);
  assert.match(html, /Enemies defeated[\s\S]*?4/);
  assert.match(html, /Falls[\s\S]*?1/);
  for (const title of ['Roll your own die', 'Shout it', 'Add them up']) assert.ok(html.includes(title), title);
  assert.equal((html.match(/<tr/g) ?? []).length, 4);
});

test('the page still renders with no hero, no setting, and nothing solved', () => {
  const html = renderPage(
    stats({
      hero: null,
      setting: null,
      minutes: 0,
      hoursEstimated: 0,
      enemiesDefeated: 0,
      fights: 0,
      falls: 0,
      tasks: { solved: 0, total: 3, list: [] },
      honor: [],
      complexity: [],
    }),
  );
  assert.ok(!/NaN|Infinity|undefined|null/.test(html));
  assert.match(html, /0 of 3/);
});

test('the generated page has no em-dash or en-dash of its own', () => {
  const html = renderPage(stats());
  for (const ch of long) assert.ok(!html.includes(ch));
});

const coords = (svg) => [...svg.matchAll(/\b(?:x|y|cx|cy|x1|x2|y1|y2)="([^"]+)"/g)].map((m) => Number(m[1]));

test('charts render valid svg for empty, single, flat, and extreme series', () => {
  const cases = [
    [],
    [{ x: 1000, y: 5 }],
    [
      { x: 1, y: 3 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ],
    [
      { x: 5, y: -100 },
      { x: 5, y: 100 },
    ],
    [
      { x: 1, y: -100 },
      { x: 9, y: 100 },
    ],
    [
      { x: Number.NaN, y: 1 },
      { x: 2, y: Infinity },
    ],
  ];
  for (const points of cases) {
    const svg = lineChart(points, { yMin: -100, yMax: 100, label: 'Honor' });
    assert.match(svg, /^<svg/);
    assert.match(svg, /<\/svg>$/);
    assert.ok(!/NaN|Infinity/.test(svg), JSON.stringify(points));
    for (const n of coords(svg)) assert.ok(Number.isFinite(n));
  }
  const flat = lineChart(
    [
      { x: 1, y: 3 },
      { x: 2, y: 3 },
    ],
    { label: 'Flat' },
  );
  assert.ok(!/NaN|Infinity/.test(flat));
});

test('honor at the floor and the ceiling stays inside the chart', () => {
  const svg = lineChart(
    [
      { x: 1, y: -100 },
      { x: 2, y: 100 },
    ],
    { yMin: -100, yMax: 100, width: 640, height: 220, label: 'Honor' },
  );
  const ys = [...svg.matchAll(/cy="([^"]+)"/g)].map((m) => Number(m[1]));
  assert.ok(ys.length === 2 && ys.every((y) => y >= 0 && y <= 220));
});

test('the chart label is escaped inside the title and the text summary', () => {
  const svg = lineChart([{ x: 1, y: 1 }], { label: '<b>x</b>' });
  assert.ok(!svg.includes('<b>'));
});

test('digits use lining figures and five stat cards fit one row on a wide screen', () => {
  const html = renderPage(stats());
  assert.match(html, /font-variant-numeric: lining-nums/);
  assert.match(html, /minmax\(130px, 1fr\)/);
});
