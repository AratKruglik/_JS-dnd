// Helper process for tests/game/parallel.test.js. Runs one library call against a DB path and
// prints the result (or the error) the way the CLI would. Not a test file.
import { openGameDb } from '../../game/db.js';
import { beginFight, heroAttack, fleeFight } from '../../game/combat-engine.js';
import { checkMove, proposeMove } from '../../game/moves.js';

const [dbPath, action, optionsJson = '{}'] = process.argv.slice(2);
const options = JSON.parse(optionsJson);

try {
  const db = openGameDb(dbPath);
  let result = { opened: true };
  if (action === 'begin') result = beginFight(db, 1, options);
  if (action === 'attack') result = heroAttack(db, 1, options);
  if (action === 'flee') result = fleeFight(db, 1);
  if (action === 'propose') result = proposeMove(db, 1, options.problem, { playerDir: options.playerDir });
  if (action === 'check') result = checkMove(db, 1, options.moveId, { playerDir: options.playerDir });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
