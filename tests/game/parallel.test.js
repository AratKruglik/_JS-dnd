import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGameDb } from '../../game/db.js';
import { MIGRATIONS } from '../../game/schema.js';
import { beginFight } from '../../game/combat-engine.js';
import { proposeMove } from '../../game/moves.js';
import { createSave, createHeroFromChoices } from '../../game/hero.js';
import { setSetting, fillWorld } from '../../game/world.js';
import { SETTING, goodWorld } from './world-fixtures.js';

const child = join(resolve(dirname(fileURLToPath(import.meta.url))), 'parallel-child.js');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const LOW = () => 0.01;

function runChild(dbPath, action, options = {}) {
  return new Promise((done) => {
    const proc = spawn(process.execPath, [child, dbPath, action, JSON.stringify(options)]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => (stdout += chunk));
    proc.stderr.on('data', (chunk) => (stderr += chunk));
    proc.on('close', (status) => done({ status, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

// Another writer holds the lock. A real child process starts, reads whatever it reads, and blocks
// on its own write. While it waits, the other writer changes the state and commits. A command that
// read its state before taking the lock now acts on a stale picture.
async function whileLocked(dbPath, action, options, change) {
  const holder = new DatabaseSync(dbPath);
  holder.exec('PRAGMA busy_timeout = 5000');
  holder.exec('BEGIN IMMEDIATE');
  const running = runChild(dbPath, action, options);
  await sleep(1000);
  change(holder);
  holder.exec('COMMIT');
  holder.close();
  return running;
}

function game() {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'jsdnd-parallel-')), 'game.db');
  const db = openGameDb(dbPath);
  const saveId = createSave(db, {});
  createHeroFromChoices(db, saveId, {
    name: 'Bilbo',
    race: 'hobbit',
    heroClass: 'rogue',
    scores: [8, 15, 14, 8, 8, 15],
  });
  setSetting(db, saveId, SETTING);
  fillWorld(db, saveId, goodWorld());
  return { db, dbPath, saveId };
}

test('two scripts opening a fresh database never fail on the migrations', async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'jsdnd-migrate-')), 'game.db');
  const other = new DatabaseSync(dbPath);
  other.exec('PRAGMA journal_mode = WAL');
  other.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  other.exec('BEGIN IMMEDIATE');
  const opening = runChild(dbPath, 'open');
  await sleep(1000);
  for (const { version, sql } of MIGRATIONS) {
    other.exec(sql);
    other.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, 'now');
  }
  other.exec('COMMIT');
  other.close();
  const result = await opening;
  assert.equal(result.status, 0, result.stderr);
});

test('a fight begun while another begin commits is refused, never a second open fight', async () => {
  const { db, dbPath, saveId } = game();
  const result = await whileLocked(dbPath, 'begin', { npcSlot: 'N1', tier: 'weak', aggressor: 'hero' }, (holder) =>
    holder
      .prepare(
        `INSERT INTO fights (save_id, started_at, trigger_reason, npc_slot, aggressor, enemy_name, enemy_tier,
           enemy_hp, enemy_hp_max, enemy_ac, hero_hp, hero_hp_max) VALUES (?, 'now', 'x', 'N1', 'hero', 'N', 'weak', 6, 6, 10, 12, 12)`,
      )
      .run(saveId),
  );
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /already in progress/i);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM fights WHERE ended_at IS NULL AND enemy_hp IS NOT NULL').get().n,
    1,
  );
});

test('an attack that waited for the lock does not erase the damage dealt meanwhile', async () => {
  const { db, dbPath, saveId } = game();
  const fight = beginFight(db, saveId, { npcSlot: 'N1', tier: 'tough', aggressor: 'hero', rng: LOW });
  const result = await whileLocked(dbPath, 'attack', {}, (holder) =>
    holder.prepare('UPDATE fights SET enemy_hp = 5 WHERE id = ?').run(fight.fightId),
  );
  assert.equal(result.status, 0, result.stderr);
  const { enemy_hp: left } = db.prepare('SELECT enemy_hp FROM fights WHERE id = ?').get(fight.fightId);
  assert.ok(left <= 5, `the enemy was healed back to ${left}`);
});

test('a move checked twice at once applies one sure hit and refuses the second', async () => {
  const { db, dbPath, saveId } = game();
  const fight = beginFight(db, saveId, { npcSlot: 'N1', tier: 'tough', aggressor: 'hero', rng: LOW });
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-parallel-player-'));
  const move = proposeMove(
    db,
    saveId,
    {
      title: 'Add',
      brief: 'Write solve(a, b).',
      difficulty: 1,
      tests: [
        { args: [1, 2], expected: 3 },
        { args: [2, 2], expected: 4 },
        { args: [5, 5], expected: 10 },
      ],
      reference: 'export function solve(a, b) { return a + b; }',
    },
    { playerDir },
  );
  writeFileSync(move.file, 'export function solve(a, b) { return a + b; }');
  const result = await whileLocked(dbPath, 'check', { moveId: move.moveId, playerDir }, (holder) =>
    holder.prepare("UPDATE fight_moves SET status = 'won' WHERE id = ?").run(move.moveId),
  );
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /already checked/i);
  const { enemy_hp: hp } = db.prepare('SELECT enemy_hp FROM fights WHERE id = ?').get(fight.fightId);
  assert.equal(hp, 26);
});
