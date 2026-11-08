import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { openGameDb, defaultGameDbPath, inTransaction } from '../../game/db.js';

const tmpFile = () => join(mkdtempSync(join(tmpdir(), 'jsdnd-game-')), 'nested', 'game.db');

test('openGameDb creates missing directories and applies pragmas', () => {
  const db = openGameDb(tmpFile());
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, 5000);
});

test('migrate is idempotent', () => {
  const path = tmpFile();
  openGameDb(path);
  const db = openGameDb(path);
  const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
  assert.deepEqual(
    versions.map((row) => row.version),
    [1, 2, 3],
  );
});

test('defaultGameDbPath does not depend on the current directory', () => {
  const savedEnv = process.env.JSDND_GAME_DB;
  const savedCwd = process.cwd();
  delete process.env.JSDND_GAME_DB;
  try {
    const before = defaultGameDbPath();
    process.chdir(mkdtempSync(join(tmpdir(), 'jsdnd-cwd-')));
    assert.equal(defaultGameDbPath(), before);
    assert.ok(isAbsolute(before));
    assert.ok(before.endsWith(join('data', 'game.db')));
    process.env.JSDND_GAME_DB = '/x/y.db';
    assert.equal(defaultGameDbPath(), '/x/y.db');
  } finally {
    process.chdir(savedCwd);
    if (savedEnv === undefined) delete process.env.JSDND_GAME_DB;
    else process.env.JSDND_GAME_DB = savedEnv;
  }
});

test('inTransaction nests: a failure in the outer block undoes a committed inner block', () => {
  const db = openGameDb(tmpFile());
  const insertSave = () =>
    inTransaction(db, () => db.prepare("INSERT INTO saves (created_at) VALUES ('now')").run());
  assert.throws(
    () =>
      inTransaction(db, () => {
        insertSave();
        throw new Error('outer failure');
      }),
    /outer failure/,
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM saves').get().n, 0);
  insertSave();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM saves').get().n, 1);
});

test('heroes, honor_events, dice_rolls, fights, and resets all have a save_id column', () => {
  const db = openGameDb(tmpFile());
  for (const table of ['heroes', 'honor_events', 'dice_rolls', 'fights', 'resets']) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    assert.ok(columns.includes('save_id'), `${table} is missing save_id`);
  }
});

test('inTransaction nests even when db.isTransaction is unavailable (older Node)', () => {
  const real = openGameDb(tmpFile());
  const db = new Proxy(real, {
    get(target, prop) {
      if (prop === 'isTransaction') return undefined;
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const insertSave = () =>
    inTransaction(db, () => db.prepare("INSERT INTO saves (created_at) VALUES ('now')").run());
  assert.throws(
    () =>
      inTransaction(db, () => {
        insertSave();
        throw new Error('outer failure');
      }),
    /outer failure/,
  );
  assert.equal(real.prepare('SELECT COUNT(*) AS n FROM saves').get().n, 0);
});
