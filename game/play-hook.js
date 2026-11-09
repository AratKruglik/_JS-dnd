// Claude Code hook for /play sessions (UserPromptSubmit and SessionStart after compaction).
// The prompt "/play" marks the session as a game. After that, every prompt gets one state line,
// and a compaction gets the full state back. Sessions that never ran /play get nothing.
// It must never throw, block a prompt, or slow a dev session down.
import { existsSync, readFileSync } from 'node:fs';
import { defaultGameDbPath, openGameDb } from './db.js';
import { resumeState, stateLine } from './resume.js';

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

function run() {
  const payload = readPayload();
  const sessionId = payload?.session_id;
  if (typeof sessionId !== 'string' || !sessionId) return;
  const isPlayPrompt =
    payload.hook_event_name === 'UserPromptSubmit' && /^\/play(\s|$)/.test(String(payload.prompt ?? '').trim());

  if (isPlayPrompt) {
    const db = openGameDb();
    db.prepare('INSERT OR IGNORE INTO play_sessions (session_id, started_at) VALUES (?, ?)').run(
      sessionId,
      new Date().toISOString(),
    );
    return;
  }

  if (!existsSync(defaultGameDbPath())) return;
  const db = openGameDb(undefined, { busyTimeoutMs: 300, runMigrations: false });
  if (!db.prepare('SELECT 1 FROM play_sessions WHERE session_id = ?').get(sessionId)) return;
  const save = db.prepare('SELECT id FROM saves ORDER BY id LIMIT 1').get();
  if (!save) return;

  if (payload.hook_event_name === 'UserPromptSubmit') {
    const line = stateLine(db, save.id);
    if (line) process.stdout.write(`${line}\n`);
  } else if (payload.hook_event_name === 'SessionStart') {
    process.stdout.write(
      `You are the Dungeon Master of this /play session. Game state after compaction: ${JSON.stringify(resumeState(db, save.id))}\n`,
    );
  }
}

try {
  run();
} catch {
  // An old database without the play_sessions table, or a busy one: say nothing this turn.
}
process.exit(0);
