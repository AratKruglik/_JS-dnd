import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave, createHero, getHero, ABILITIES } from '../../game/hero.js';
import { freshDb } from './helpers.js';

test('createHero sets level 1 and every ability to base 8 with no trait adjustment', () => {
  const db = freshDb();
  const saveId = createSave(db, { name: 'Run 1' });
  createHero(db, saveId, { name: 'Bilbo', race: 'hobbit', heroClass: 'rogue' });
  const hero = getHero(db, saveId);
  assert.equal(hero.name, 'Bilbo');
  assert.equal(hero.race, 'hobbit');
  assert.equal(hero.heroClass, 'rogue');
  assert.equal(hero.level, 1);
  assert.deepEqual(Object.keys(hero.abilities), ABILITIES);
  for (const ability of ABILITIES) {
    assert.deepEqual(hero.abilities[ability], { base: 8, traitAdjust: 0 });
  }
});

test('a second createHero for the same save throws', () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  createHero(db, saveId, { name: 'A', race: 'elf', heroClass: 'druid' });
  assert.throws(() => createHero(db, saveId, { name: 'B', race: 'dwarf', heroClass: 'fighter' }));
});

test('an ability outside the six is rejected by the schema', () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  const heroId = createHero(db, saveId, { name: 'A', race: 'elf', heroClass: 'druid' });
  assert.throws(() => db.prepare("INSERT INTO hero_abilities (hero_id, ability) VALUES (?, 'LUCK')").run(heroId));
});

test('getHero returns null when the save has no hero', () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  assert.equal(getHero(db, saveId), null);
});
