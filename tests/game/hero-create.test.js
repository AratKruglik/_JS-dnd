import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave, createHeroFromChoices, getHero } from '../../game/hero.js';
import { applyTamperReset } from '../../game/reset.js';
import { setSetting, fillWorld } from '../../game/world.js';
import { SETTING, goodWorld } from './world-fixtures.js';
import { freshDb, count } from './helpers.js';

const setup = () => {
  const db = freshDb();
  return { db, saveId: createSave(db, {}) };
};

// Scores are in ability order: STR, DEX, CON, INT, WIS, CHA. This spread costs 25 points.
const SPREAD = [8, 15, 14, 8, 8, 15];

const base = { name: 'Bilbo', race: 'hobbit', heroClass: 'Magician', scores: SPREAD };

test('a standard hero gets point-buy scores as base and race bonuses as trait_adjust', () => {
  const { db, saveId } = setup();
  createHeroFromChoices(db, saveId, base);
  const hero = getHero(db, saveId);
  assert.deepEqual([hero.name, hero.race, hero.heroClass, hero.level], ['Bilbo', 'halfling', 'wizard', 1]);
  assert.deepEqual(hero.abilities.DEX, { base: 15, traitAdjust: 2 });
  assert.deepEqual(hero.abilities.STR, { base: 8, traitAdjust: 0 });
  assert.deepEqual(hero.abilities.CHA, { base: 15, traitAdjust: 0 });
});

test('a custom race stores its description and approved bonuses', () => {
  const { db, saveId } = setup();
  createHeroFromChoices(db, saveId, {
    ...base,
    race: 'Zorbian',
    bonuses: { INT: 2, STR: -1 },
    raceDescription: 'Skin like frosted glass, hums when nervous.',
  });
  const hero = getHero(db, saveId);
  assert.equal(hero.race, 'Zorbian');
  assert.equal(hero.raceDescription, 'Skin like frosted glass, hums when nervous.');
  assert.deepEqual(hero.abilities.INT, { base: 8, traitAdjust: 2 });
  assert.deepEqual(hero.abilities.STR, { base: 8, traitAdjust: -1 });
});

test('a custom race without a description or with over-cap bonuses is rejected and writes nothing', () => {
  const { db, saveId } = setup();
  assert.throws(
    () => createHeroFromChoices(db, saveId, { ...base, race: 'Zorbian', bonuses: { INT: 2 } }),
    /description/i,
  );
  assert.throws(
    () =>
      createHeroFromChoices(db, saveId, {
        ...base,
        race: 'Zorbian',
        bonuses: { INT: 2, STR: 2, DEX: 1 },
        raceDescription: 'x',
      }),
    /bonus/i,
  );
  assert.equal(count(db, 'heroes'), 0);
  assert.equal(count(db, 'hero_abilities'), 0);
});

test('a standard race with supplied bonuses is rejected', () => {
  const { db, saveId } = setup();
  assert.throws(() => createHeroFromChoices(db, saveId, { ...base, bonuses: { STR: 2 } }), /fixed bonuses/i);
  assert.equal(count(db, 'heroes'), 0);
});

test('an invalid point buy writes nothing', () => {
  const { db, saveId } = setup();
  for (const scores of [
    [15, 15, 15, 15, 8, 8],
    [8, 8, 8, 8, 8],
    [16, 8, 8, 8, 8, 8],
  ]) {
    assert.throws(() => createHeroFromChoices(db, saveId, { ...base, scores }), /points|exactly|whole number/i);
  }
  assert.equal(count(db, 'heroes'), 0);
  assert.equal(count(db, 'hero_abilities'), 0);
});

test('a custom class requires a description and stores it', () => {
  const { db, saveId } = setup();
  assert.throws(() => createHeroFromChoices(db, saveId, { ...base, heroClass: 'Space Pirate' }), /description/i);
  createHeroFromChoices(db, saveId, { ...base, heroClass: 'Space Pirate', classDescription: 'Robs cargo ships.' });
  const hero = getHero(db, saveId);
  assert.deepEqual([hero.heroClass, hero.classDescription], ['Space Pirate', 'Robs cargo ships.']);
});

test('an empty name is rejected', () => {
  const { db, saveId } = setup();
  for (const name of ['', '   ', undefined]) {
    assert.throws(() => createHeroFromChoices(db, saveId, { ...base, name }), /name/i);
  }
});

test('the hero starts at L1', () => {
  const { db, saveId } = setup();
  createHeroFromChoices(db, saveId, base);
  assert.equal(getHero(db, saveId).locationSlot, 'L1');
});

test('a tamper reset returns abilities to 8 and 0 but keeps the race and the descriptions', () => {
  const { db, saveId } = setup();
  createHeroFromChoices(db, saveId, {
    ...base,
    race: 'Zorbian',
    bonuses: { INT: 2 },
    raceDescription: 'Glass skin.',
  });
  applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' });
  const hero = getHero(db, saveId);
  assert.deepEqual(hero.abilities.DEX, { base: 8, traitAdjust: 0 });
  assert.deepEqual(hero.abilities.INT, { base: 8, traitAdjust: 0 });
  assert.deepEqual([hero.race, hero.raceDescription, hero.level], ['Zorbian', 'Glass skin.', 1]);
});

test('hero create replaces the hero while onboarding is unfinished, so the player can start over', () => {
  const { db, saveId } = setup();
  createHeroFromChoices(db, saveId, base);
  createHeroFromChoices(db, saveId, {
    ...base,
    name: 'Legolas',
    race: 'elf',
    heroClass: 'ranger',
    scores: [8, 15, 8, 8, 14, 8],
  });
  const hero = getHero(db, saveId);
  assert.deepEqual([hero.name, hero.race, hero.heroClass], ['Legolas', 'elf', 'ranger']);
  assert.deepEqual(hero.abilities.DEX, { base: 15, traitAdjust: 2 });
  assert.equal(count(db, 'heroes'), 1);
  assert.equal(count(db, 'hero_abilities'), 6);
});

test('once the world is complete a second hero is refused with a readable message', () => {
  const { db, saveId } = setup();
  createHeroFromChoices(db, saveId, base);
  setSetting(db, saveId, SETTING);
  fillWorld(db, saveId, goodWorld());
  assert.throws(() => createHeroFromChoices(db, saveId, { ...base, name: 'Other' }), /already have a hero/i);
  assert.equal(getHero(db, saveId).name, 'Bilbo');
});
