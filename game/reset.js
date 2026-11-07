import { inTransaction } from './db.js';
import { getHero } from './hero.js';
import { addHonorEvent, getHonor, HONOR_MIN } from './honor.js';

// The punishment for touching the dice. History is kept; a resets row marks the fall.
// Quest progress restarts by reading this marker (Plan 3). One reset per distinct fingerprint.
export function applyTamperReset(db, saveId, { expected, found }) {
  return inTransaction(db, () => {
    const seen = db
      .prepare('SELECT 1 FROM resets WHERE save_id = ? AND fingerprint_found = ?')
      .get(saveId, found);
    if (seen) return { applied: false };

    const hero = getHero(db, saveId);
    if (!hero) throw new Error(`Save ${saveId} has no hero to reset.`);

    const reason = found === 'missing' ? 'dice file missing' : 'dice file modified';
    db.prepare(
      'INSERT INTO resets (save_id, created_at, reason, fingerprint_expected, fingerprint_found) VALUES (?, ?, ?, ?, ?)',
    ).run(saveId, new Date().toISOString(), reason, expected, found);

    addHonorEvent(db, saveId, {
      delta: HONOR_MIN - getHonor(db, saveId),
      kind: 'reset',
      reason: 'dice tampered',
    });
    db.prepare('UPDATE heroes SET level = 1 WHERE id = ?').run(hero.id);
    db.prepare('UPDATE hero_abilities SET base = 8, trait_adjust = 0 WHERE hero_id = ?').run(hero.id);
    return { applied: true };
  });
}
