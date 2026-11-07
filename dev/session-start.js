import { openDevDb } from './db.js';
import { getState, getMeta } from './notes.js';
import { fetchBoard } from './board.js';
import { renderGreeting } from './greeting.js';

try {
  const db = openDevDb();
  const owner = getMeta(db, 'board_owner');
  const number = getMeta(db, 'board_number');
  const board = owner && number
    ? fetchBoard({ owner, number: Number(number) })
    : { ok: false, reason: 'board not configured' };
  console.log(renderGreeting(getState(db), board));
} catch (error) {
  console.log(`Dev notes unavailable: ${String(error?.message ?? error).split('\n')[0]}`);
}
process.exit(0);
