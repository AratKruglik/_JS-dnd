import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGameDb } from '../../game/db.js';
import { sealDice } from '../../game/integrity.js';
import { count } from './helpers.js';
import { SETTING, goodWorld } from './world-fixtures.js';

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
    JSDND_PLAYER_DIR: join(dir, 'player'),
    JSDND_QUEST_TIMEOUT_MS: '3000',
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

const solutionFile = (id, kind = 'reference') => join(root, 'tests', 'quests', 'solutions', `${id}.${kind}.js`);

test('quest list shows the three quests unsolved with complexity', () => {
  const { run } = install();
  run('init');
  const result = run('quest', 'list');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.json.quests.map((q) => [q.id, q.solved]),
    [
      ['dice-roll', false],
      ['string-shout', false],
      ['array-sum', false],
    ],
  );
  assert.ok(result.json.quests.every((q) => q.complexity >= 1));
});

test('quest start writes the stub and a second start does not overwrite edits', () => {
  const { run } = install();
  run('init');
  const first = run('quest', 'start', 'dice-roll');
  assert.equal(first.json.created, true);
  appendFileSync(first.json.file, '// my edit\n');
  const second = run('quest', 'start', 'dice-roll');
  assert.equal(second.json.created, false);
  assert.match(readFileSync(second.json.file, 'utf8'), /my edit/);
});

test('full loop: start, solve, check passes with tone, judge clean, progress, honor up', () => {
  const { run } = install();
  run('init');
  const started = run('quest', 'start', 'dice-roll');
  copyFileSync(solutionFile('dice-roll'), started.json.file);
  const checked = run('quest', 'check', 'dice-roll');
  assert.equal(checked.status, 0, checked.stderr);
  assert.deepEqual([checked.json.status, checked.json.next, checked.json.tone], ['pass', 'judge', 'gentle']);
  const judged = run('quest', 'judge', 'dice-roll', 'clean', 'looks honest');
  assert.deepEqual([judged.json.solved, judged.json.honor], [true, 8]);
  assert.deepEqual(run('quest', 'progress').json.solved, ['dice-roll']);
  assert.equal(run('honor', 'show').json.honor, 8);
});

test('quest check on a failing file prints got and expected and exits 0 with next retry', () => {
  const { run } = install();
  run('init');
  const started = run('quest', 'start', 'array-sum');
  copyFileSync(solutionFile('array-sum', 'wrong'), started.json.file);
  const checked = run('quest', 'check', 'array-sum');
  assert.equal(checked.status, 0);
  assert.equal(checked.json.status, 'fail');
  assert.equal(checked.json.next, 'retry');
  assert.ok(checked.json.got && checked.json.expected);
  assert.equal(checked.json.tone, undefined);
});

test('an infinite-loop player file returns status timeout and the CLI still exits 0', () => {
  const { run } = install();
  run('init');
  const started = run('quest', 'start', 'string-shout');
  writeFileSync(started.json.file, 'export function shout() { while (true) {} }\n');
  const checked = run('quest', 'check', 'string-shout');
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(checked.json.status, 'timeout');
});

test('link check classifies a legal and an illegal link; link use lowers honor for illegal ones', () => {
  const { run } = install();
  run('init');
  assert.equal(run('link', 'check', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript').json.legal, true);
  assert.equal(run('link', 'check', 'https://stackoverflow.com/q/1').json.legal, false);
  const legal = run('link', 'use', 'dice-roll', 'https://javascript.info/');
  assert.deepEqual([legal.json.legal, legal.json.hintsUsed, legal.json.honor], [true, 1, 0]);
  const illegal = run('link', 'use', 'dice-roll', 'https://stackoverflow.com/q/1');
  assert.deepEqual([illegal.json.legal, illegal.json.hintsUsed, illegal.json.honor], [false, 2, -2]);
});

test('honor event applies the table delta and an unknown kind exits 1 with a JSON error', () => {
  const { run } = install();
  run('init');
  assert.equal(run('honor', 'event', 'swearing', 'cursed at the baker').json.honor, -2);
  const bad = run('honor', 'event', 'moonwalk');
  assert.equal(bad.status, 1);
  assert.match(JSON.parse(bad.stderr.trim()).error, /unknown honor kind/i);
});

test('quest hint logs a hint and extra arguments are rejected on the new commands', () => {
  const { run } = install();
  run('init');
  assert.equal(run('quest', 'hint', 'dice-roll', 'npc_speech', 'the old wizard rambled').json.hintsUsed, 1);
  for (const args of [['quest', 'progress', 'extra'], ['link', 'check', 'a', 'b'], ['quest', 'list', 'x']]) {
    const result = run(...args);
    assert.equal(result.status, 1, `${args.join(' ')} should be rejected`);
    assert.match(JSON.parse(result.stderr.trim()).error, /argument/i);
  }
});

test('tampering with the dice blocks quest commands with exit 2', () => {
  const { env, run } = install();
  run('init');
  appendFileSync(env.JSDND_DICE_PATH, '\n// cheat\n');
  assert.equal(run('quest', 'list').status, 2);
  assert.equal(run('quest', 'check', 'dice-roll').status, 2);
});

const HERO_ARGS = ['hero', 'create', '--name', 'Bilbo', '--race', 'hobbit', '--class', 'rogue', '--scores', '8,15,14,8,8,15'];
const SETTING_ARGS = ['world', 'setting', '--source', SETTING.source, '--name', SETTING.name, '--desc', SETTING.description, '--voice', SETTING.voice];

function readyGame() {
  const game = install();
  game.run('init');
  assert.equal(game.run(...HERO_ARGS).status, 0);
  assert.equal(game.run(...SETTING_ARGS).status, 0);
  const fill = game.run('world', 'fill', '--data', JSON.stringify(goodWorld()));
  assert.equal(fill.status, 0, fill.stderr);
  return game;
}

test('rules lists the standard races with bonuses, the classes, and the point buy table', () => {
  const { run } = install();
  run('init');
  const races = run('rules', 'races').json;
  assert.equal(races.races.length, 9);
  assert.deepEqual(races.races.find((r) => r.name === 'dwarf').bonuses, { CON: 2 });
  assert.equal(races.aliases.hobbit, 'halfling');
  assert.equal(run('rules', 'classes').json.classes.length, 12);
  const pointbuy = run('rules', 'pointbuy').json;
  assert.deepEqual([pointbuy.budget, pointbuy.min, pointbuy.max, pointbuy.costs['15']], [27, 8, 15, 9]);
});

test('hero create stores a valid hero and rejects an invalid spread with exit 1 and nothing written', () => {
  const { run } = install();
  run('init');
  const bad = run('hero', 'create', '--name', 'Bilbo', '--race', 'elf', '--class', 'rogue', '--scores', '15,15,15,15,8,8');
  assert.equal(bad.status, 1);
  assert.match(JSON.parse(bad.stderr.trim()).error, /points/i);
  assert.equal(run('hero', 'show').status, 1);
  const good = run(...HERO_ARGS);
  assert.equal(good.status, 0, good.stderr);
  assert.equal(good.json.hero.race, 'halfling');
  assert.deepEqual(good.json.hero.abilities.DEX, { base: 15, traitAdjust: 2 });
});

test('a custom race round trip with approved bonuses and a description', () => {
  const { run } = install();
  run('init');
  const result = run(
    'hero', 'create', '--name', 'Zed', '--race', 'Zorbian', '--class', 'wizard', '--scores', '8,8,8,15,8,8',
    '--bonuses', 'INT=2,STR=-1', '--race-desc', '- Glass skin that hums.',
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.json.hero.abilities.INT, { base: 15, traitAdjust: 2 });
  assert.deepEqual(result.json.hero.abilities.STR, { base: 8, traitAdjust: -1 });
  assert.equal(result.json.hero.raceDescription, '- Glass skin that hums.');
});

test('world setting, skeleton, fill, and status round trip until complete', () => {
  const { run } = install();
  run('init');
  assert.deepEqual(run('world', 'status').json.missing, ['setting', 'locations', 'npcs']);
  const skeleton = run('world', 'skeleton').json;
  assert.equal(skeleton.locations.length, 6);
  assert.equal(skeleton.npcs.length, 6);
  assert.equal(skeleton.start, 'L1');
  assert.equal(run(...SETTING_ARGS).status, 0);
  const fill = run('world', 'fill', '--data', JSON.stringify(goodWorld()));
  assert.deepEqual([fill.json.locations, fill.json.npcs], [6, 6]);
  assert.equal(run('world', 'status').json.complete, true);
});

test('world fill rejects a banned phrase and names it, and bad JSON', () => {
  const { run } = install();
  run('init');
  const world = goodWorld();
  world.npcs.N3.description = 'Feel free to ask me anything.';
  const banned = run('world', 'fill', '--data', JSON.stringify(world));
  assert.equal(banned.status, 1);
  assert.match(JSON.parse(banned.stderr.trim()).error, /feel free to/i);
  const broken = run('world', 'fill', '--data', '{not json');
  assert.equal(broken.status, 1);
  assert.match(JSON.parse(broken.stderr.trim()).error, /json/i);
  assert.equal(run('world', 'status').json.npcsFilled, 0);
});

test('look, go, and talk work end to end after fill, and going to a non-exit exits 1', () => {
  const { run } = readyGame();
  assert.equal(run('look').json.location.slot, 'L1');
  assert.equal(run('go', 'L2').json.location.slot, 'L2');
  assert.equal(run('look').json.location.name, 'Place 2');
  const bad = run('go', 'L6');
  assert.equal(bad.status, 1);
  assert.match(JSON.parse(bad.stderr.trim()).error, /not an exit/i);
  run('go', 'place 1');
  assert.equal(run('talk', 'N1').json.offer.questId, 'dice-roll');
});

test('voice lint returns hits for AI-speak and ok for clean prose', () => {
  const { run } = install();
  run('init');
  assert.deepEqual(run('voice', 'lint', 'Great question, traveler.').json, { ok: true, lint: false, hits: ['great question'] });
  assert.deepEqual(run('voice', 'lint', 'The bridge is out.').json, { ok: true, lint: true, hits: [] });
});

test('each command accepts only its own options and no extra arguments', () => {
  const { run } = readyGame();
  const rejected = [
    ['look', 'extra'],
    ['world', 'status', '--data', 'x'],
    ['rules', 'races', 'x'],
    ['voice', 'lint', 'a', 'b'],
    ['quest', 'list', '--context', 'hi'],
    ['roll', 'd20', '--roll', '3'],
    ['go', 'L2', 'L3'],
  ];
  for (const args of rejected) {
    const result = run(...args);
    assert.equal(result.status, 1, `${args.join(' ')} should be rejected`);
    assert.ok(JSON.parse(result.stderr.trim()).error.length > 0);
  }
});

test('dash-led and negative values inside options are accepted as values', () => {
  const { run } = install();
  run('init');
  const result = run('world', 'setting', '--source', 'written', '--name', '- Odd Name', '--desc', '-5 degrees and falling', '--voice', '- terse');
  assert.equal(result.status, 0, result.stderr);
});

test('tampering with the dice blocks the new commands with exit 2', () => {
  const { env, run } = readyGame();
  appendFileSync(env.JSDND_DICE_PATH, '\n// cheat\n');
  assert.equal(run('look').status, 2);
  assert.equal(run('go', 'L2').status, 2);
  assert.equal(run('world', 'status').status, 2);
});
