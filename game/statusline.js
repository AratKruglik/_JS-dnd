// Claude Code runs this as the project status line. It reads the session JSON on stdin, stores
// the real 5 hour usage reading for the save, and prints one line. It must never throw or hang.
import { existsSync, readFileSync } from 'node:fs';
import { defaultGameDbPath, openGameDb } from './db.js';
import { parsePayload, recordReading, currentStamina, renderBar } from './stamina.js';
import { DEFAULT_LANGUAGE, effectiveLanguage, t } from './i18n.js';

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
  // The language is the save's. With no database or save the bar speaks English.
  let lang = DEFAULT_LANGUAGE;
  let db = null;
  let save = null;
  if (existsSync(defaultGameDbPath())) {
    try {
      // A status line must not wait on a busy game command or change the schema.
      db = openGameDb(undefined, { busyTimeoutMs: 300, runMigrations: false });
      save = db.prepare('SELECT id FROM saves ORDER BY id LIMIT 1').get();
      if (save) lang = effectiveLanguage(db, save.id);
    } catch {
      save = null;
    }
  }
  const fromPayload = reading
    ? renderBar({ ...reading, estimated: false }, now, 10, { color: true, lang })
    : t(lang, 'stamina.unknown');
  if (!save) return fromPayload;
  try {
    if (reading) recordReading(db, save.id, reading, now);
    return renderBar(currentStamina(db, save.id, now), now, 10, { color: true, lang });
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
