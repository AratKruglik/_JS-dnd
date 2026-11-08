import { inTransaction } from './db.js';

const now = () => new Date().toISOString();

export function startFight(db, saveId, { triggerReason }) {
  const result = db
    .prepare('INSERT INTO fights (save_id, started_at, trigger_reason) VALUES (?, ?, ?)')
    .run(saveId, now(), triggerReason);
  return Number(result.lastInsertRowid);
}

// seq is computed inside the write transaction so numbering can never gap or collide.
export function logFightStep(db, fightId, { actor, action, rollId = null, detail = null }) {
  return inTransaction(db, () => {
    const fight = db.prepare('SELECT ended_at FROM fights WHERE id = ?').get(fightId);
    if (!fight) throw new Error(`No fight ${fightId}.`);
    if (fight.ended_at !== null) throw new Error(`Fight ${fightId} already ended.`);
    const { next } = db
      .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM fight_log WHERE fight_id = ?')
      .get(fightId);
    db.prepare(
      'INSERT INTO fight_log (fight_id, seq, created_at, actor, action, roll_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(fightId, next, now(), actor, action, rollId, detail);
    return next;
  });
}

// The low level fight commands are for plain logging. A combat fight (one with enemy HP) belongs to
// the fight engine: closing it by hand would skip the dice, the honor, and the knockout.
export function assertLegacyFight(db, fightId) {
  const fight = db.prepare('SELECT enemy_hp FROM fights WHERE id = ?').get(fightId);
  if (fight && fight.enemy_hp !== null) {
    throw new Error(
      `Fight ${fightId} is a combat fight. Use fight attack or fight flee, not the low level fight commands.`,
    );
  }
}

export function endFight(db, fightId, outcome) {
  const result = db
    .prepare('UPDATE fights SET ended_at = ?, outcome = ? WHERE id = ? AND ended_at IS NULL')
    .run(now(), outcome, fightId);
  if (result.changes === 0) throw new Error(`Fight ${fightId} does not exist or already ended.`);
}

export function getFightLog(db, fightId) {
  return db
    .prepare(
      'SELECT seq, created_at, actor, action, roll_id, detail FROM fight_log WHERE fight_id = ? ORDER BY seq ASC',
    )
    .all(fightId)
    .map((r) => ({
      seq: r.seq,
      createdAt: r.created_at,
      actor: r.actor,
      action: r.action,
      rollId: r.roll_id,
      detail: r.detail,
    }));
}
