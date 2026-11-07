import { inTransaction } from './db.js';

export const HONOR_MIN = -100;
export const HONOR_MAX = 100;

const clamp = (value) => Math.min(HONOR_MAX, Math.max(HONOR_MIN, value));

export function getHonor(db, saveId) {
  const row = db
    .prepare('SELECT honor_after FROM honor_events WHERE save_id = ? ORDER BY id DESC LIMIT 1')
    .get(saveId);
  return row ? row.honor_after : 0;
}

// Stores the raw delta plus the clamped running total, so the ending page can chart it.
export function addHonorEvent(db, saveId, { delta, kind, reason }) {
  if (!Number.isInteger(delta)) throw new RangeError(`Honor delta must be a finite integer, got ${delta}`);
  return inTransaction(db, () => {
    const honorAfter = clamp(getHonor(db, saveId) + delta);
    db.prepare(
      'INSERT INTO honor_events (save_id, created_at, delta, kind, reason, honor_after) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(saveId, new Date().toISOString(), delta, kind, reason, honorAfter);
    return honorAfter;
  });
}

export function getHonorHistory(db, saveId) {
  return db
    .prepare('SELECT * FROM honor_events WHERE save_id = ? ORDER BY id ASC')
    .all(saveId)
    .map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      delta: r.delta,
      kind: r.kind,
      reason: r.reason,
      honorAfter: r.honor_after,
    }));
}
