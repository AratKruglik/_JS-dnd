import { inTransaction } from './db.js';
import { ABILITIES, STANDARD_RACES, resolveName, validatePointBuy, validateCustomBonuses } from './rules.js';
import { worldStatus } from './world-status.js';

export { ABILITIES };

const now = () => new Date().toISOString();

export function createSave(db, { name = null } = {}) {
  const result = db.prepare('INSERT INTO saves (name, created_at) VALUES (?, ?)').run(name, now());
  return Number(result.lastInsertRowid);
}

export function createHero(db, saveId, { name, race, heroClass }) {
  return inTransaction(db, () => {
    const result = db
      .prepare('INSERT INTO heroes (save_id, name, race, hero_class, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(saveId, name, race, heroClass, now());
    const heroId = Number(result.lastInsertRowid);
    const insert = db.prepare('INSERT INTO hero_abilities (hero_id, ability) VALUES (?, ?)');
    for (const ability of ABILITIES) insert.run(heroId, ability);
    return heroId;
  });
}

// The real onboarding path: validates everything before writing anything.
// `scores` are the six point-buy scores in ability order. A standard race brings its own fixed
// bonuses; a custom race needs a description and bonuses the player approved.
export function createHeroFromChoices(db, saveId, { name, race, heroClass, scores, bonuses, raceDescription, classDescription }) {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) throw new Error('The hero needs a name.');

  const pointBuy = validatePointBuy(scores);
  if (!pointBuy.ok) throw new Error(pointBuy.errors.join(' '));

  const resolvedRace = resolveName('race', race);
  const resolvedClass = resolveName('class', heroClass);
  if (!resolvedRace.name) throw new Error('The hero needs a race.');
  if (!resolvedClass.name) throw new Error('The hero needs a class.');

  let raceBonuses;
  let storedRaceDescription = null;
  if (resolvedRace.standard) {
    if (bonuses && Object.keys(bonuses).length > 0) {
      throw new Error(`A standard race has fixed bonuses; ${resolvedRace.name} cannot take custom ones.`);
    }
    raceBonuses = STANDARD_RACES[resolvedRace.name];
  } else {
    if (typeof raceDescription !== 'string' || !raceDescription.trim()) {
      throw new Error(`A custom race needs a description. Describe ${resolvedRace.name}.`);
    }
    const check = validateCustomBonuses(bonuses ?? {});
    if (!check.ok) throw new Error(`Custom race bonus problem: ${check.errors.join(' ')}`);
    raceBonuses = bonuses ?? {};
    storedRaceDescription = raceDescription.trim();
  }

  let storedClassDescription = null;
  if (!resolvedClass.standard) {
    if (typeof classDescription !== 'string' || !classDescription.trim()) {
      throw new Error(`A custom class needs a description. Describe ${resolvedClass.name}.`);
    }
    storedClassDescription = classDescription.trim();
  }

  return inTransaction(db, () => {
    // Until the world is complete the player is still onboarding and may start over.
    const existing = db.prepare('SELECT id FROM heroes WHERE save_id = ?').get(saveId);
    if (existing) {
      if (worldStatus(db, saveId).complete) {
        throw new Error('You already have a hero and the adventure has begun, so the hero cannot be replaced.');
      }
      db.prepare('DELETE FROM hero_abilities WHERE hero_id = ?').run(existing.id);
      db.prepare('DELETE FROM heroes WHERE id = ?').run(existing.id);
    }
    const heroId = createHero(db, saveId, { name: cleanName, race: resolvedRace.name, heroClass: resolvedClass.name });
    const update = db.prepare('UPDATE hero_abilities SET base = ?, trait_adjust = ? WHERE hero_id = ? AND ability = ?');
    ABILITIES.forEach((ability, i) => update.run(scores[i], raceBonuses[ability] ?? 0, heroId, ability));
    db.prepare('UPDATE heroes SET race_description = ?, class_description = ? WHERE id = ?').run(
      storedRaceDescription,
      storedClassDescription,
      heroId,
    );
    return heroId;
  });
}

export function getHero(db, saveId) {
  const row = db.prepare('SELECT * FROM heroes WHERE save_id = ?').get(saveId);
  if (!row) return null;
  const rows = db.prepare('SELECT ability, base, trait_adjust FROM hero_abilities WHERE hero_id = ?').all(row.id);
  const byName = Object.fromEntries(rows.map((r) => [r.ability, { base: r.base, traitAdjust: r.trait_adjust }]));
  return {
    id: row.id,
    saveId: row.save_id,
    name: row.name,
    race: row.race,
    heroClass: row.hero_class,
    level: row.level,
    raceDescription: row.race_description,
    classDescription: row.class_description,
    locationSlot: row.location_slot,
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, byName[a]])),
  };
}
