import { getProgress } from './quests.js';

export const BOSS_SLOT = 'N7';

// The campaign ends when every quest is solved in the current epoch and the final boss was beaten
// after the latest tamper reset. A reset therefore locks the ending again.
export function endingStatus(db, saveId) {
  const progress = getProgress(db, saveId);
  const lastReset = db.prepare('SELECT MAX(created_at) AS at FROM resets WHERE save_id = ?').get(saveId).at;
  const bossDefeated = Boolean(
    db
      .prepare(
        "SELECT 1 FROM fights WHERE save_id = ? AND npc_slot = ? AND outcome = 'won' AND (? IS NULL OR ended_at > ?) LIMIT 1",
      )
      .get(saveId, BOSS_SLOT, lastReset, lastReset),
  );
  const questsSolved = progress.solved.length;
  return {
    questsSolved,
    questsTotal: progress.total,
    bossDefeated,
    unlocked: questsSolved === progress.total && bossDefeated,
  };
}
