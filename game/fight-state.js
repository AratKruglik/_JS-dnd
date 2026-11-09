import { getFightLog } from './fights.js';

// The read-only side of a fight: which fight is open and what it looks like right now. It imports
// nothing that depends on the sealed dice files, so the play hook and the resume state can use it even
// when game/dice.js or game/rolls.js is missing or broken.
export const openFight = (db, saveId) =>
  db
    .prepare(
      'SELECT * FROM fights WHERE save_id = ? AND ended_at IS NULL AND enemy_hp IS NOT NULL ORDER BY id DESC LIMIT 1',
    )
    .get(saveId);

export function stateOf(db, fightId, extras = {}) {
  const f = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
  return {
    fightId,
    round: f.round,
    hero: { hp: f.hero_hp, hpMax: f.hero_hp_max },
    enemy: { name: f.enemy_name, tier: f.enemy_tier, hp: f.enemy_hp, hpMax: f.enemy_hp_max, ac: f.enemy_ac },
    status: f.outcome ?? 'open',
    log: getFightLog(db, fightId).slice(-6),
    ...extras,
  };
}

export function getFightState(db, saveId) {
  const f = openFight(db, saveId);
  return f ? stateOf(db, f.id) : null;
}
