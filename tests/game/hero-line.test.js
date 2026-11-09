import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGameDb } from '../../game/db.js';
import { createSave, createHeroFromChoices } from '../../game/hero.js';
import { setLanguage } from '../../game/i18n.js';
import { setSetting, fillWorld, go } from '../../game/world.js';
import { renderHeroLine, heroLineInfo } from '../../game/hero-line.js';
import { grantItem } from '../../game/inventory.js';
import { barColor } from '../../game/stamina.js';
import { SETTING, goodWorld } from './world-fixtures.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = join(root, 'game', 'statusline.js');
const ESC = String.fromCharCode(27);
const strip = (text) => text.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '');

const info = (overrides = {}) => ({
  name: 'Bilbo',
  level: 1,
  hp: 10,
  maxHp: 10,
  gold: 15,
  items: 2,
  location: 'The Market',
  ...overrides,
});

test('the hero line says name, level, health, gold, items, and place in English', () => {
  assert.equal(renderHeroLine(info()), 'Bilbo Lv1 | HP 10/10 | 15 gold | 2 items | The Market');
  assert.equal(renderHeroLine(info({ items: 1 })), 'Bilbo Lv1 | HP 10/10 | 15 gold | 1 item | The Market');
  assert.equal(renderHeroLine(info({ items: 0 })), 'Bilbo Lv1 | HP 10/10 | 15 gold | 0 items | The Market');
});

test('the hero line is Ukrainian in a Ukrainian save, with the right plural for items', () => {
  const uk = (items) => renderHeroLine(info({ items, name: 'Більбо', location: 'Ринок' }), { lang: 'uk' });
  assert.equal(uk(2), 'Більбо рів. 1 | ЗДОРОВʼЯ 10/10 | золото 15 | 2 речі | Ринок');
  const tail = (n) => uk(n).split(' | ')[3];
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map(tail), [
    '1 річ',
    '2 речі',
    '5 речей',
    '11 речей',
    '21 річ',
    '22 речі',
    '25 речей',
  ]);
});

test('the health color follows the stamina thresholds: green 100 to 60, yellow 59 to 40, red 39 to 0', () => {
  const code = (hp, maxHp) => /\[(\d+)m/.exec(renderHeroLine(info({ hp, maxHp }), { color: true }))[1];
  assert.deepEqual(
    [100, 60, 59, 40, 39, 1, 0].map((percent) => code(percent, 100)),
    ['32', '32', '33', '33', '31', '31', '31'],
  );
  // The same cut as the stamina bar, so the two lines agree.
  assert.equal(barColor(40), 'green');
  assert.equal(strip(renderHeroLine(info(), { color: true })), renderHeroLine(info()));
  assert.ok(renderHeroLine(info(), { color: true }).endsWith(`${ESC}[0m`));
});

test('odd numbers never print NaN or break the line', () => {
  const line = renderHeroLine(info({ hp: -3, maxHp: 0, gold: 0, items: 0 }));
  assert.ok(!/NaN|undefined|Infinity/.test(line), line);
});

function ready(language) {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-hero-line-'));
  const dbPath = join(dir, 'game.db');
  const db = openGameDb(dbPath);
  const saveId = createSave(db, {});
  createHeroFromChoices(db, saveId, {
    name: 'Bilbo',
    race: 'hobbit',
    heroClass: 'fighter',
    scores: [8, 15, 14, 8, 8, 15],
  });
  setSetting(db, saveId, SETTING);
  fillWorld(db, saveId, goodWorld());
  if (language) setLanguage(db, saveId, language);
  return { db, saveId, dbPath };
}

test('the line reads the hero, health, gold, items, and the place name from the save', () => {
  const { db, saveId } = ready();
  assert.equal(heroLineInfo(db, saveId + 5), null);
  const start = heroLineInfo(db, saveId);
  assert.deepEqual(
    { ...start, location: typeof start.location },
    { name: 'Bilbo', level: 1, hp: 12, maxHp: 12, gold: 0, items: 0, location: 'string' },
  );
  db.prepare('UPDATE heroes SET gold = 9 WHERE save_id = ?').run(saveId);
  grantItem(db, saveId, { source: 'quest', questId: 'dice-roll' });
  go(db, saveId, 'L2');
  const moved = heroLineInfo(db, saveId);
  assert.deepEqual([moved.gold, moved.items], [9, 1]);
  assert.equal(moved.location, goodWorld().locations.L2.name);
  assert.notEqual(moved.location, start.location);
});

const payload = () => ({
  rate_limits: { five_hour: { used_percentage: 38, resets_at: Math.floor(Date.now() / 1000) + 133 * 60 } },
});
const runBar = (dbPath, input = JSON.stringify(payload())) =>
  spawnSync('node', [script], { env: { ...process.env, JSDND_GAME_DB: dbPath }, input, encoding: 'utf8' });

test('the status line prints the hero line first and the stamina line second', () => {
  const { dbPath, db, saveId } = ready();
  db.prepare('UPDATE heroes SET gold = 15 WHERE save_id = ?').run(saveId);
  const result = runBar(dbPath);
  assert.equal(result.status, 0, result.stderr);
  const lines = strip(result.stdout).split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[2], '');
  assert.match(lines[0], /^Bilbo Lv1 \| HP 12\/12 \| 15 gold \| 0 items \| /);
  assert.match(lines[1], /^STAMINA \[######----\] 62% left/);
  assert.ok(result.stdout.startsWith(`${ESC}[32m`), 'the hero line is colored');
});

test('the status line speaks the save language on both lines', () => {
  const { dbPath } = ready('uk');
  const lines = strip(runBar(dbPath).stdout).split('\n');
  assert.match(lines[0], /^Bilbo рів\. 1 \| ЗДОРОВʼЯ 12\/12 \| золото 0 \| 0 речей \| /);
  assert.match(lines[1], /^ВИТРИВАЛІСТЬ \[######----\]/);
});

test('with no hero yet the status line is the stamina line alone, as before', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-hero-line-none-'));
  const dbPath = join(dir, 'game.db');
  createSave(openGameDb(dbPath), {});
  const result = runBar(dbPath);
  assert.equal(strip(result.stdout).split('\n').length, 2);
  assert.match(strip(result.stdout), /^STAMINA \[/);
});

test('a database from before the vitals migration still draws the stamina line and never crashes', () => {
  const { dbPath, db } = ready();
  db.exec('ALTER TABLE heroes DROP COLUMN hp');
  const result = runBar(dbPath);
  assert.equal(result.status, 0, result.stderr);
  assert.match(strip(result.stdout), /^STAMINA \[######----\] 62% left[^\n]*\n$/);
});
