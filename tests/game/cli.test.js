import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGameDb } from '../../game/db.js';
import { sealDice } from '../../game/integrity.js';
import { count } from './helpers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = join(root, 'game', 'cli.js');
const realDice = join(root, 'game', 'dice.js');

function install() {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-cli-'));
  const env = {
    ...process.env,
    JSDND_GAME_DB: join(dir, 'game.db'),
    JSDND_DICE_PATH: join(dir, 'dice.js'),
    JSDND_DICE_SEAL: join(dir, 'dice.sha256'),
  };
  copyFileSync(realDice, env.JSDND_DICE_PATH);
  sealDice(env.JSDND_DICE_PATH, env.JSDND_DICE_SEAL);
  const run = (...args) => {
    const result = spawnSync('node', [cli, ...args], { cwd: dir, env, encoding: 'utf8' });
    return { ...result, json: result.stdout.trim() ? JSON.parse(result.stdout) : null };
  };
  return { dir, env, run, db: () => openGameDb(env.JSDND_GAME_DB) };
}

test('init creates the DB and one save and is safe to run twice', () => {
  const { run, db } = install();
  const first = run('init');
  const second = run('init');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.json.saveId, second.json.saveId);
  assert.equal(count(db(), 'saves'), 1);
});

test('roll prints one line of compact JSON with results and total and logs the roll', () => {
  const { run, db } = install();
  run('init');
  const result = run('roll', '2d6', '--context', 'test roll');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  assert.equal(result.json.results.length, 2);
  assert.equal(result.json.total, result.json.results[0] + result.json.results[1]);
  const row = db().prepare('SELECT * FROM dice_rolls').get();
  assert.equal(row.spec, '2d6');
  assert.equal(row.context, 'test roll');
});

test('fight round trip: start, two logs, end, show returns two ordered steps', () => {
  const { run } = install();
  run('init');
  const { fightId } = run('fight', 'start', 'shopkeeper warned twice').json;
  const rolled = run('roll', '1d20').json;
  assert.equal(run('fight', 'log', String(fightId), 'hero', 'swing', 'wide arc', '--roll', String(rolled.id)).json.seq, 1);
  assert.equal(run('fight', 'log', String(fightId), 'shopkeeper', 'dodge').json.seq, 2);
  assert.equal(run('fight', 'end', String(fightId), 'won').status, 0);
  const shown = run('fight', 'show', String(fightId));
  assert.deepEqual(
    shown.json.log.map((s) => [s.seq, s.actor, s.action]),
    [
      [1, 'hero', 'swing'],
      [2, 'shopkeeper', 'dodge'],
    ],
  );
});

test('tampered dice: first command exits 2 and resets, a second exits 2 without resetting again, restoring works', () => {
  const { env, run, db } = install();
  run('init');
  run('hero', 'new', 'Bilbo', 'hobbit', 'rogue');
  run('honor', 'add', '20', 'help', 'helped the baker');
  appendFileSync(env.JSDND_DICE_PATH, '\n// cheat\n');

  const first = run('honor', 'show');
  assert.equal(first.status, 2);
  assert.equal(first.json.tamper, true);
  assert.equal(first.json.reset, true);

  const second = run('honor', 'show');
  assert.equal(second.status, 2);
  assert.equal(second.json.reset, false);
  assert.equal(count(db(), 'resets'), 1);

  copyFileSync(realDice, env.JSDND_DICE_PATH);
  const restored = run('honor', 'show');
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(restored.json.honor, -100);
});

test('a missing dice file exits 2 and resets', () => {
  const { env, run, db } = install();
  run('init');
  run('hero', 'new', 'Bilbo', 'hobbit', 'rogue');
  rmSync(env.JSDND_DICE_PATH);
  const result = run('roll', 'd20');
  assert.equal(result.status, 2);
  assert.equal(result.json.reset, true);
  assert.equal(count(db(), 'resets'), 1);
  assert.equal(count(db(), 'dice_rolls'), 0);
});

test('tamper before a hero exists still blocks without crashing', () => {
  const { env, run } = install();
  run('init');
  appendFileSync(env.JSDND_DICE_PATH, '\n// early\n');
  const result = run('roll', 'd20');
  assert.equal(result.status, 2);
  assert.equal(result.json.tamper, true);
  assert.equal(result.json.reset, false);
});

test('a bad roll spec exits 1 with a JSON error and no roll row', () => {
  const { run, db } = install();
  run('init');
  const result = run('roll', '1000d6');
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr.trim()).error, /dice/i);
  assert.equal(count(db(), 'dice_rolls'), 0);
});

test('integrity check on a sealed copy exits 0', () => {
  const { run } = install();
  run('init');
  const result = run('integrity', 'check');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.ok, true);
});

test('a negative honor delta is accepted', () => {
  const { run } = install();
  run('init');
  run('hero', 'new', 'Bilbo', 'hobbit', 'rogue');
  const result = run('honor', 'add', '-5', 'swear', 'cursed at a guard');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.honor, -5);
});

test('dash-leading values do not crash the CLI', () => {
  const { run } = install();
  run('init');
  const bad = run('roll', '-1d6');
  assert.equal(bad.status, 1);
  assert.match(JSON.parse(bad.stderr.trim()).error, /dice/i);
  const { fightId } = run('fight', 'start', 'test').json;
  const detail = run('fight', 'log', String(fightId), 'hero', 'swing', '- crit');
  assert.equal(detail.status, 0, detail.stderr);
});

test('an unknown option fails as a JSON error, not a stack trace', () => {
  const { run } = install();
  run('init');
  const result = run('roll', 'd20', '--bogus');
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr.trim()).error, /unknown option/i);
});

test('numbers must be plain whole numbers', () => {
  const { run, db } = install();
  run('init');
  run('hero', 'new', 'Bilbo', 'hobbit', 'rogue');
  for (const delta of ['0x10', '1e2', ' 7 ', '1.5']) {
    const result = run('honor', 'add', delta, 'x', 'y');
    assert.equal(result.status, 1, `delta "${delta}" should be rejected`);
  }
  const { fightId } = run('fight', 'start', 'test').json;
  const badFight = run('fight', 'log', 'abc', 'hero', 'swing');
  assert.equal(badFight.status, 1);
  assert.match(JSON.parse(badFight.stderr.trim()).error, /fightId/);
  const badRoll = run('fight', 'log', String(fightId), 'hero', 'swing', '--roll', 'abc');
  assert.equal(badRoll.status, 1);
  assert.equal(count(db(), 'fight_log'), 0);
});

test('integrity seal is not part of the player CLI and cannot be used to hide tampering', () => {
  const { env, run } = install();
  run('init');
  const sealBefore = readFileSync(env.JSDND_DICE_SEAL, 'utf8');
  const untampered = run('integrity', 'seal');
  assert.equal(untampered.status, 1);
  appendFileSync(env.JSDND_DICE_PATH, '\n// cheat\n');
  const tampered = run('integrity', 'seal');
  assert.equal(tampered.status, 2);
  assert.equal(readFileSync(env.JSDND_DICE_SEAL, 'utf8'), sealBefore);
  assert.equal(run('roll', 'd20').status, 2);
});

test('parallel commands do not fail with a locked database', async () => {
  const { env, dir, run } = install();
  run('init');
  const runOne = (...args) =>
    new Promise((resolveRun) => {
      const child = spawn('node', [cli, ...args], { cwd: dir, env });
      child.on('close', (status) => resolveRun(status));
    });
  const jobs = [];
  for (let i = 0; i < 20; i++) jobs.push(runOne('honor', 'show'), runOne('roll', 'd20'));
  const statuses = await Promise.all(jobs);
  assert.deepEqual(statuses.filter((s) => s !== 0), []);
});
