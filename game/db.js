import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATIONS } from './schema.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function defaultGameDbPath() {
  return process.env.JSDND_GAME_DB ?? resolve(repoRoot, 'data', 'game.db');
}

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const { version, sql } of MIGRATIONS) {
    db.exec('BEGIN IMMEDIATE');
    try {
      // Checked again under the lock: another script may have applied this one while we waited.
      if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version)) {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
          version,
          new Date().toISOString(),
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

// Nesting depth per connection. Tracked here instead of reading db.isTransaction,
// which older Node versions that already ship node:sqlite do not have.
const openBlocks = new WeakMap();

// Runs fn inside one write transaction. Rolls back and rethrows if fn throws.
// Re-entrant: inside an open block, fn simply joins it and the outer block decides.
export function inTransaction(db, fn) {
  if (openBlocks.has(db)) return fn();
  db.exec('BEGIN IMMEDIATE');
  openBlocks.set(db, true);
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    openBlocks.delete(db);
  }
}

// A caller that must not wait or write schema (the status line) passes a short timeout and no migrations.
export function openGameDb(path = defaultGameDbPath(), { busyTimeoutMs = 5000, runMigrations = true } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // busy_timeout goes first: switching to WAL needs a lock, and parallel script calls
  // would otherwise fail with "database is locked" instead of waiting their turn.
  db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  if (runMigrations) migrate(db);
  return db;
}
