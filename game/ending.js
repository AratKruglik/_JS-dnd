import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProgress, defaultPlayerDir } from './quests.js';
import { collectStats } from './ending-stats.js';
import { renderPage } from './ending-page.js';

export const BOSS_SLOT = 'N7';

// The campaign ends when every quest is solved in the current epoch and the final boss was beaten
// after the latest tamper reset. A reset therefore locks the ending again.
export function endingStatus(db, saveId) {
  const progress = getProgress(db, saveId);
  const lastReset = db.prepare('SELECT MAX(created_at) AS at FROM resets WHERE save_id = ?').get(saveId).at;
  // The boss must fall after the latest solve of this epoch. A quest added or solved later reopens
  // the road, so the boss has to be beaten again.
  const lastSolve = db
    .prepare('SELECT MAX(solved_at) AS at FROM quest_solves WHERE save_id = ? AND epoch = ? AND revoked_at IS NULL')
    .get(saveId, progress.epoch).at;
  const bossDefeated = Boolean(
    db
      .prepare(
        "SELECT 1 FROM fights WHERE save_id = ? AND npc_slot = ? AND outcome = 'won' AND (? IS NULL OR ended_at > ?) AND (? IS NULL OR ended_at > ?) LIMIT 1",
      )
      .get(saveId, BOSS_SLOT, lastReset, lastReset, lastSolve, lastSolve),
  );
  const questsSolved = progress.solved.length;
  return {
    questsSolved,
    questsTotal: progress.total,
    bossDefeated,
    unlocked: questsSolved === progress.total && bossDefeated,
  };
}

// Writes the stats page into the player folder. Refuses until the ending is unlocked.
export function buildEnding(db, saveId, { playerDir = defaultPlayerDir() } = {}) {
  const status = endingStatus(db, saveId);
  if (!status.unlocked) {
    const left = [];
    if (status.questsSolved < status.questsTotal)
      left.push(`${status.questsTotal - status.questsSolved} quest(s) unsolved`);
    if (!status.bossDefeated) left.push('the final boss still stands');
    throw new Error(`The road is not over yet: ${left.join(' and ')}.`);
  }
  const stats = collectStats(db, saveId);
  mkdirSync(playerDir, { recursive: true });
  const file = join(playerDir, 'ending.html');
  writeFileSync(file, renderPage(stats));
  return { file, minutes: stats.minutes };
}
