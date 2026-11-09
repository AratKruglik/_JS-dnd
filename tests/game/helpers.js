import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGameDb } from '../../game/db.js';
import { QUESTS } from '../../quests/index.js';

// Every test that opens a game database runs the translator strictly: a missing key or placeholder
// throws, so a leak of a raw {placeholder} fails a test. Spawned CLI processes inherit it.
process.env.JSDND_I18N_STRICT = '1';

export const freshDb = () => openGameDb(join(mkdtempSync(join(tmpdir(), 'jsdnd-game-')), 'game.db'));

export const count = (db, table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

// Records a passing, judged solve without running anything, so a test can stand at any rung.
export function markSolved(db, saveId, questId, solvedAt = new Date().toISOString()) {
  const epoch = db.prepare('SELECT COUNT(*) AS n FROM resets WHERE save_id = ?').get(saveId).n;
  const attempt = db
    .prepare(
      "INSERT INTO quest_attempts (save_id, quest_id, created_at, status, expected, got, message, complexity) VALUES (?, ?, ?, 'pass', '', '', '', 1)",
    )
    .run(saveId, questId, solvedAt);
  db.prepare(
    'INSERT INTO quest_solves (save_id, quest_id, attempt_id, solved_at, epoch, hints_used, complexity) VALUES (?, ?, ?, ?, ?, 0, 1)',
  ).run(saveId, questId, Number(attempt.lastInsertRowid), solvedAt, epoch);
  db.prepare("INSERT INTO quest_judgments (attempt_id, created_at, verdict, note) VALUES (?, ?, 'clean', NULL)").run(
    Number(attempt.lastInsertRowid),
    solvedAt,
  );
}

// Solves every quest that comes before this one in the ladder.
export function markSolvedBefore(db, saveId, questId) {
  for (const quest of QUESTS.slice(
    0,
    QUESTS.findIndex((q) => q.id === questId),
  ))
    markSolved(db, saveId, quest.id);
}
