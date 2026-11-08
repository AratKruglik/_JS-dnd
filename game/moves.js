import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inTransaction } from './db.js';
import { openFight, heroAttack, loseHeroTurn } from './combat-engine.js';
import { runMoveTests, validateMoveProblem } from './move-runner.js';
import { defaultPlayerDir } from './quests.js';

const now = () => new Date().toISOString();
const comment = (text) => text.split('\n').map((line) => `// ${line}`.trimEnd()).join('\n');

// The Master proposes a problem for a spectacular move. Nothing is stored unless the problem's
// own reference solution passes its own tests. The tests stay in the DB, hidden from the player.
export function proposeMove(db, saveId, problem, { playerDir = defaultPlayerDir(), timeoutMs } = {}) {
  const fight = openFight(db, saveId);
  if (!fight) throw new Error('No fight in progress.');
  if (db.prepare("SELECT 1 FROM fight_moves WHERE fight_id = ? AND status = 'open'").get(fight.id)) {
    throw new Error('There is already an open move in this fight. Check it first.');
  }
  const check = validateMoveProblem(problem, timeoutMs ? { timeoutMs } : undefined);
  if (!check.ok) throw new Error(check.errors.join(' '));

  const moveId = Number(
    db
      .prepare('INSERT INTO fight_moves (fight_id, created_at, title, brief, difficulty, tests, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(fight.id, now(), problem.title.trim(), problem.brief.trim(), problem.difficulty, JSON.stringify(problem.tests), 'open')
      .lastInsertRowid,
  );
  mkdirSync(playerDir, { recursive: true });
  const file = join(playerDir, `move-${moveId}.js`);
  writeFileSync(
    file,
    `${comment(`Combat move: ${problem.title.trim()}`)}\n${comment(problem.brief.trim())}\n// Export a function named solve.\nexport function solve() {\n  // your code here\n}\n`,
  );
  return { moveId, file, title: problem.title.trim(), brief: problem.brief.trim() };
}

// Runs the player's solve() against the hidden tests. A pass is a sure hit with double damage;
// anything else (wrong, error, timeout, missing file) loses the turn.
export function checkMove(db, saveId, moveId, { playerDir = defaultPlayerDir(), timeoutMs, rng } = {}) {
  const fight = openFight(db, saveId);
  if (!fight) throw new Error('No fight in progress.');
  const move = db.prepare('SELECT * FROM fight_moves WHERE id = ? AND fight_id = ?').get(moveId, fight.id);
  if (!move) throw new Error(`No move ${moveId} found in this fight.`);
  if (move.status !== 'open') throw new Error(`Move ${moveId} was already checked (${move.status}).`);

  const check = runMoveTests(join(playerDir, `move-${moveId}.js`), JSON.parse(move.tests), timeoutMs ? { timeoutMs } : undefined);
  const won = check.status === 'pass';
  return inTransaction(db, () => {
    db.prepare('UPDATE fight_moves SET status = ? WHERE id = ?').run(won ? 'won' : 'failed', moveId);
    const state = won
      ? heroAttack(db, saveId, { sureHit: true, doubleDamage: true, rng })
      : loseHeroTurn(db, saveId, { rng });
    return { moveStatus: won ? 'won' : 'failed', check, fight: state };
  });
}
