// A fight won against an NPC knocks them out, it does not kill them. They stay out cold until
// the hero solves another quest. Clean verdicts are counted across all epochs, so a reset cannot
// wake them, while a revoked solve that is solved again still counts as a new solve.
const solveCount = (db, saveId) =>
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM quest_judgments j JOIN quest_attempts a ON a.id = j.attempt_id WHERE a.save_id = ? AND j.verdict = 'clean'",
    )
    .get(saveId).n;

export function knockOut(db, saveId, npcSlot) {
  db.prepare(
    `INSERT INTO npc_knockouts (save_id, npc_slot, solves_at_knockout, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (save_id, npc_slot) DO UPDATE SET solves_at_knockout = excluded.solves_at_knockout, created_at = excluded.created_at`,
  ).run(saveId, npcSlot, solveCount(db, saveId), new Date().toISOString());
}

export function isKnockedOut(db, saveId, npcSlot) {
  const row = db
    .prepare('SELECT solves_at_knockout FROM npc_knockouts WHERE save_id = ? AND npc_slot = ?')
    .get(saveId, npcSlot);
  return Boolean(row) && row.solves_at_knockout === solveCount(db, saveId);
}

export function requireAwake(db, saveId, npcSlot) {
  if (isKnockedOut(db, saveId, npcSlot)) {
    throw new Error(`${npcSlot} is knocked out. They wake once the hero solves another quest.`);
  }
}
