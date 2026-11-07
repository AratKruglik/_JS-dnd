import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  issue_number INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'blocked', 'done')),
  detail TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  issue_number INTEGER REFERENCES tasks (issue_number),
  kind TEXT NOT NULL CHECK (kind IN ('status', 'completed', 'prediction')),
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function defaultDevDbPath() {
  return process.env.JSDND_DEV_DB ?? resolve(repoRoot, '.dev', 'dev.db');
}

export function openDevDb(path = defaultDevDbPath()) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
