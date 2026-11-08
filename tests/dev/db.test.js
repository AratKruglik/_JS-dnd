import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { openDevDb, defaultDevDbPath } from '../../dev/db.js';

const fresh = () => openDevDb(join(mkdtempSync(join(tmpdir(), 'jsdnd-')), 'nested', 'dev.db'));

const now = () => new Date().toISOString();

test('openDevDb creates missing directories and applies pragmas', () => {
  const db = fresh();
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, 5000);
});

test('schema rejects an unknown task status', () => {
  const db = fresh();
  assert.throws(() =>
    db
      .prepare('INSERT INTO tasks (issue_number, title, status, updated_at) VALUES (?, ?, ?, ?)')
      .run(1, 'x', 'finished', now()),
  );
});

test('schema enforces the notes foreign key', () => {
  const db = fresh();
  assert.throws(() =>
    db
      .prepare('INSERT INTO notes (created_at, issue_number, kind, body) VALUES (?, ?, ?, ?)')
      .run(now(), 999, 'status', 'orphan'),
  );
});

test('defaultDevDbPath does not depend on the current directory', () => {
  const savedEnv = process.env.JSDND_DEV_DB;
  const savedCwd = process.cwd();
  delete process.env.JSDND_DEV_DB;
  try {
    const before = defaultDevDbPath();
    process.chdir(mkdtempSync(join(tmpdir(), 'jsdnd-cwd-')));
    assert.equal(defaultDevDbPath(), before);
    assert.ok(isAbsolute(before));
    assert.ok(before.endsWith(join('.dev', 'dev.db')));
    process.env.JSDND_DEV_DB = '/x/y.db';
    assert.equal(defaultDevDbPath(), '/x/y.db');
  } finally {
    process.chdir(savedCwd);
    if (savedEnv === undefined) delete process.env.JSDND_DEV_DB;
    else process.env.JSDND_DEV_DB = savedEnv;
  }
});

test('schema rejects an unknown note kind', () => {
  const db = fresh();
  assert.throws(() =>
    db
      .prepare('INSERT INTO notes (created_at, issue_number, kind, body) VALUES (?, ?, ?, ?)')
      .run(now(), null, 'rumor', 'nope'),
  );
});
