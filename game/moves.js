import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inTransaction } from './db.js';
import { openFight, heroAttack, loseHeroTurn } from './combat-engine.js';
import { runMoveTests, validateMoveProblem } from './move-runner.js';
import { defaultPlayerDir } from './quests.js';

const now = () => new Date().toISOString();
const comment = (text) =>
  text
    .split('\n')
    .map((line) => `// ${line}`.trimEnd())
    .join('\n');

function requireOpenFight(db, saveId) {
  const fight = openFight(db, saveId);
  if (!fight) throw new Error('No fight in progress.');
  return fight;
}

function requireNoOpenMove(db, fight) {
  if (db.prepare("SELECT 1 FROM fight_moves WHERE fight_id = ? AND status = 'open'").get(fight.id)) {
    throw new Error('There is already an open move in this fight. Check it first.');
  }
}

// The Master proposes a problem for a spectacular move. Nothing is stored unless the problem's
// own reference solution passes its own tests. The tests stay in the DB, hidden from the player.
export function proposeMove(db, saveId, problem, { playerDir = defaultPlayerDir(), timeoutMs } = {}) {
  // Cheap checks first, so a pointless proposal never runs the reference solution.
  requireNoOpenMove(db, requireOpenFight(db, saveId));
  const check = validateMoveProblem(problem, timeoutMs ? { timeoutMs } : undefined);
  if (!check.ok) throw new Error(check.errors.join(' '));

  // The row and the stub are one unit: if the file cannot be written the row is rolled back, and
  // a file the player already has under that name is kept as move-<id>.old.js, never overwritten.
  return inTransaction(db, () => {
    const fight = requireOpenFight(db, saveId);
    requireNoOpenMove(db, fight);
    const moveId = Number(
      db
        .prepare(
          'INSERT INTO fight_moves (fight_id, created_at, title, brief, difficulty, tests, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          fight.id,
          now(),
          problem.title.trim(),
          problem.brief.trim(),
          problem.difficulty,
          JSON.stringify(problem.tests),
          'open',
        ).lastInsertRowid,
    );
    mkdirSync(playerDir, { recursive: true });
    const file = join(playerDir, `move-${moveId}.js`);
    const temp = `${file}.tmp`;
    writeFileSync(
      temp,
      `${comment(`Combat move: ${problem.title.trim()}`)}\n${comment(problem.brief.trim())}\n// Export a function named solve.\nexport function solve() {\n  // your code here\n}\n`,
    );
    if (existsSync(file)) renameSync(file, join(playerDir, `move-${moveId}.old.js`));
    renameSync(temp, file);
    return { moveId, file, title: problem.title.trim(), brief: problem.brief.trim() };
  });
}

// Runs the player's solve() against the hidden tests. A pass is a sure hit with double damage;
// anything else (wrong, error, timeout, missing file) loses the turn.
export function checkMove(db, saveId, moveId, { playerDir = defaultPlayerDir(), timeoutMs, rng, modifiers } = {}) {
  const readMove = () => {
    const fight = requireOpenFight(db, saveId);
    const move = db.prepare('SELECT * FROM fight_moves WHERE id = ? AND fight_id = ?').get(moveId, fight.id);
    if (!move) throw new Error(`No move ${moveId} found in this fight.`);
    if (move.status !== 'open') throw new Error(`Move ${moveId} was already checked (${move.status}).`);
    return move;
  };

  // The player's code can run for seconds, so it runs outside the lock. The move is read again
  // under the lock before anything is applied, so two checks at once cannot both count.
  const tests = JSON.parse(readMove().tests);
  const check = runMoveTests(join(playerDir, `move-${moveId}.js`), tests, timeoutMs ? { timeoutMs } : undefined);
  const won = check.status === 'pass';
  return inTransaction(db, () => {
    readMove();
    db.prepare('UPDATE fight_moves SET status = ? WHERE id = ?').run(won ? 'won' : 'failed', moveId);
    const state = won
      ? heroAttack(db, saveId, { sureHit: true, doubleDamage: true, rng, modifiers })
      : loseHeroTurn(db, saveId, { rng, modifiers });
    return { moveStatus: won ? 'won' : 'failed', check, fight: state };
  });
}
