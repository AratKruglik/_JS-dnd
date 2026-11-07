import { roll } from './dice.js';

// Rolls first, so a bad spec throws before anything is written.
export function rollAndLog(db, saveId, spec, context = null, rng = Math.random) {
  const rolled = roll(spec, rng);
  const result = db
    .prepare('INSERT INTO dice_rolls (save_id, created_at, spec, results, total, context) VALUES (?, ?, ?, ?, ?, ?)')
    .run(saveId, new Date().toISOString(), rolled.spec, JSON.stringify(rolled.results), rolled.total, context);
  return { id: Number(result.lastInsertRowid), ...rolled };
}
