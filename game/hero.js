import { inTransaction } from './db.js';

export const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

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
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, byName[a]])),
  };
}
