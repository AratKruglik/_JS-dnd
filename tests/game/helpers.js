import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGameDb } from '../../game/db.js';

export const freshDb = () => openGameDb(join(mkdtempSync(join(tmpdir(), 'jsdnd-game-')), 'game.db'));

export const count = (db, table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
