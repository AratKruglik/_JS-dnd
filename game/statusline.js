// Claude Code runs this as the project status line. It reads the session JSON on stdin, stores
// the real 5 hour usage reading for the save, and prints one line. It must never throw or hang.
import { existsSync, readFileSync } from 'node:fs';
import { defaultGameDbPath, openGameDb } from './db.js';
import { parsePayload, recordReading, currentStamina, renderBar } from './stamina.js';

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

function line() {
  const reading = parsePayload(readPayload());
  const now = Date.now();
  const fromPayload = reading
    ? renderBar({ ...reading, estimated: false }, now, 10, { color: true })
    : 'STAMINA unknown';
  if (!existsSync(defaultGameDbPath())) return fromPayload;
  try {
    // A status line must not wait on a busy game command or change the schema.
    const db = openGameDb(undefined, { busyTimeoutMs: 300, runMigrations: false });
    const save = db.prepare('SELECT id FROM saves ORDER BY id LIMIT 1').get();
    if (!save) return fromPayload;
    if (reading) recordReading(db, save.id, reading, now);
    return renderBar(currentStamina(db, save.id, now), now, 10, { color: true });
  } catch {
    return fromPayload;
  }
}

let text;
try {
  text = line();
} catch {
  text = 'STAMINA unknown';
}
process.stdout.write(`${text}\n`);
