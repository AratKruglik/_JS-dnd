// A fight won against an NPC knocks them out, it does not kill them. They stay out cold until
// the hero solves another quest, which is counted across all epochs so a reset cannot wake them.
const solveCount = (db, saveId) => db.prepare('SELECT COUNT(*) AS n FROM quest_solves WHERE save_id = ?').get(saveId).n;

export function knockOut(db, saveId, npcSlot) {
  db.prepare(
    `INSERT INTO npc_knockouts (save_id, npc_slot, solves_at_knockout, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (save_id, npc_slot) DO UPDATE SET solves_at_knockout = excluded.solves_at_knockout, created_at = excluded.created_at`,
  ).run(saveId, npcSlot, solveCount(db, saveId), new Date().toISOString());
}

export function isKnockedOut(db, saveId, npcSlot) {
  const row = db.prepare('SELECT solves_at_knockout FROM npc_knockouts WHERE save_id = ? AND npc_slot = ?').get(saveId, npcSlot);
  return Boolean(row) && row.solves_at_knockout === solveCount(db, saveId);
}

export function requireAwake(db, saveId, npcSlot) {
  if (isKnockedOut(db, saveId, npcSlot)) {
    throw new Error(`${npcSlot} is knocked out. They wake once the hero solves another quest.`);
  }
}
