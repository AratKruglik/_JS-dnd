import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDARD_RACES,
  STANDARD_CLASSES,
  ALIASES,
  POINT_BUY_COSTS,
  POINT_BUY_BUDGET,
  resolveName,
  normalizeName,
  displayName,
  validatePointBuy,
  validateCustomBonuses,
} from '../../game/rules.js';
import { ABILITIES } from '../../game/hero.js';

test('the point buy table matches 5e', () => {
  assert.equal(POINT_BUY_BUDGET, 27);
  assert.deepEqual(POINT_BUY_COSTS, { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 });
});

test('a standard 27-point spread is valid', () => {
  const result = validatePointBuy([15, 15, 15, 8, 8, 8]);
  assert.deepEqual(result, { ok: true, spent: 27, errors: [] });
});

test('under budget is valid and reports spent', () => {
  assert.deepEqual(validatePointBuy([8, 8, 8, 8, 8, 8]), { ok: true, spent: 0, errors: [] });
  assert.equal(validatePointBuy([10, 10, 10, 10, 10, 10]).spent, 12);
});

test('over budget, out of range, wrong count, and non-integers are rejected with readable errors', () => {
  const bad = [
    [15, 15, 15, 15, 8, 8],
    [16, 8, 8, 8, 8, 8],
    [7, 8, 8, 8, 8, 8],
    [8, 8, 8, 8, 8],
    [8, 8, 8, 8, 8, 8, 8],
    [8.5, 8, 8, 8, 8, 8],
    '15,15,15,8,8,8',
    null,
  ];
  for (const scores of bad) {
    const result = validatePointBuy(scores);
    assert.equal(result.ok, false, `${JSON.stringify(scores)} should be rejected`);
    assert.ok(result.errors.length > 0 && result.errors.every((e) => typeof e === 'string' && e.length > 0));
  }
});

test('resolveName maps aliases and flags custom names', () => {
  assert.deepEqual(resolveName('race', 'hobbit'), { standard: true, name: 'halfling' });
  assert.deepEqual(resolveName('class', 'Magician'), { standard: true, name: 'wizard' });
  assert.deepEqual(resolveName('race', '  Elf '), { standard: true, name: 'elf' });
  assert.deepEqual(resolveName('race', 'Zorbian'), { standard: false, name: 'Zorbian' });
  assert.deepEqual(resolveName('class', 'Space Pirate'), { standard: false, name: 'Space Pirate' });
  assert.equal(ALIASES.hobbit, 'halfling');
});

test('there are nine standard races and twelve standard classes', () => {
  assert.equal(Object.keys(STANDARD_RACES).length, 9);
  assert.equal(STANDARD_CLASSES.length, 12);
});

test('every standard race except human stays within +2 each and +4 in total (the custom cap)', () => {
  for (const [race, bonuses] of Object.entries(STANDARD_RACES)) {
    for (const key of Object.keys(bonuses)) assert.ok(ABILITIES.includes(key), `${race} has unknown ability ${key}`);
    if (race === 'human') {
      assert.deepEqual(Object.values(bonuses), [1, 1, 1, 1, 1, 1]);
      continue;
    }
    const values = Object.values(bonuses);
    assert.ok(
      values.every((v) => v >= 1 && v <= 2),
      `${race} has a bonus outside 1 to 2`,
    );
    assert.ok(values.reduce((a, b) => a + b, 0) <= 4, `${race} bonuses total more than 4`);
  }
});

test('custom bonuses: each within -2 to +2 and positives total at most 4', () => {
  assert.equal(validateCustomBonuses({ STR: 2, DEX: 1, CON: -1 }).ok, true);
  assert.equal(validateCustomBonuses({ CHA: 2, DEX: 1, CON: 1 }).ok, true);
  assert.equal(validateCustomBonuses({}).ok, true);
  for (const bad of [{ STR: 3 }, { STR: 2, DEX: 2, CON: 1 }, { LUCK: 1 }, { STR: 1.5 }, { STR: -3 }, null, 'STR=2']) {
    const result = validateCustomBonuses(bad);
    assert.equal(result.ok, false, `${JSON.stringify(bad)} should be rejected`);
    assert.ok(result.errors.length > 0);
  }
});

test('a Ukrainian race or class name, or alias, resolves to the stable English key', () => {
  assert.deepEqual(resolveName('race', 'ельф'), { standard: true, name: 'elf' });
  assert.deepEqual(resolveName('race', 'Напіврослик'), { standard: true, name: 'halfling' });
  assert.deepEqual(resolveName('race', 'гобіт'), { standard: true, name: 'halfling' });
  assert.deepEqual(resolveName('race', '  ДВАРФ '), { standard: true, name: 'dwarf' });
  assert.deepEqual(resolveName('race', 'драконороджений'), { standard: true, name: 'dragonborn' });
  assert.deepEqual(resolveName('class', 'чарівник'), { standard: true, name: 'wizard' });
  assert.deepEqual(resolveName('class', 'маг'), { standard: true, name: 'wizard' });
  assert.deepEqual(resolveName('class', 'Чародій'), { standard: true, name: 'sorcerer' });
  assert.deepEqual(resolveName('class', 'плут'), { standard: true, name: 'rogue' });
});

test('English names and aliases still resolve whatever the save language is, and the old ones keep working', () => {
  assert.deepEqual(resolveName('race', 'Hobbit'), { standard: true, name: 'halfling' });
  assert.deepEqual(resolveName('class', 'magician'), { standard: true, name: 'wizard' });
  assert.deepEqual(resolveName('race', 'half elf'), { standard: true, name: 'half-elf' });
  assert.deepEqual(resolveName('race', 'elf'), { standard: true, name: 'elf' });
});

test('a custom race or class typed in Ukrainian stays exactly as typed', () => {
  assert.deepEqual(resolveName('race', '  Зорбіанин '), { standard: false, name: 'Зорбіанин' });
  assert.deepEqual(resolveName('class', 'Вуличний поет'), { standard: false, name: 'Вуличний поет' });
  assert.deepEqual(resolveName('race', 'ельф-вигнанець'), { standard: false, name: 'ельф-вигнанець' });
});

test('a race name does not resolve as a class and the other way round', () => {
  assert.equal(resolveName('class', 'ельф').standard, false);
  assert.equal(resolveName('race', 'чарівник').standard, false);
});

test('normalizeName flattens case, spacing, and every apostrophe variant', () => {
  const ʼ = String.fromCharCode(0x02bc);
  const curly = String.fromCharCode(0x2019);
  assert.equal(normalizeName('  Дʼ Артаньян  '), "д' артаньян");
  assert.equal(normalizeName(`м${ʼ}яч`), "м'яч");
  assert.equal(normalizeName(`м${curly}яч`), "м'яч");
  assert.equal(normalizeName('м`яч'), "м'яч");
  assert.equal(normalizeName('Half   Elf'), 'half elf');
  assert.equal(normalizeName(undefined), '');
});

test('displayName shows the language name for a standard pick and the typed text for a custom one', () => {
  assert.equal(displayName('race', 'halfling', 'en'), 'Halfling');
  assert.equal(displayName('race', 'halfling', 'uk'), 'напіврослик');
  assert.equal(displayName('class', 'wizard', 'uk'), 'чарівник');
  assert.equal(displayName('class', 'wizard', 'en'), 'Wizard');
  assert.equal(displayName('race', 'Зорбіанин', 'uk'), 'Зорбіанин');
  assert.equal(displayName('race', 'Zorbian', 'en'), 'Zorbian');
});
