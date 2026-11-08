import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGameDb } from '../../game/db.js';
import { sealDice } from '../../game/integrity.js';
import { count } from './helpers.js';
import { checkQuest, judgeQuest } from '../../game/quests.js';
import { beginFight, heroAttack } from '../../game/combat-engine.js';
import { QUESTS } from '../../quests/index.js';
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
  const runWith = (input, args) => {
    const result = spawnSync('node', [cli, ...args], { cwd: dir, env, encoding: 'utf8', input });
    return { ...result, json: result.stdout.trim() ? JSON.parse(result.stdout) : null };
  };
  const run = (...args) => runWith(undefined, args);
  const runInput = (input, ...args) => runWith(input, args);
  return { dir, env, run, runInput, db: () => openGameDb(env.JSDND_GAME_DB) };
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
  assert.equal(skeleton.npcs.length, 7);
  assert.equal(skeleton.start, 'L1');
  assert.equal(run(...SETTING_ARGS).status, 0);
  const fill = run('world', 'fill', '--data', JSON.stringify(goodWorld()));
  assert.deepEqual([fill.json.locations, fill.json.npcs], [6, 7]);
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

test('world show returns the setting with its voice, and errors before one is set', () => {
  const { run } = install();
  run('init');
  const early = run('world', 'show');
  assert.equal(early.status, 1);
  assert.match(JSON.parse(early.stderr.trim()).error, /no setting/i);
  assert.equal(run(...SETTING_ARGS).status, 0);
  const shown = run('world', 'show');
  assert.deepEqual(shown.json.setting, {
    source: SETTING.source,
    name: SETTING.name,
    description: SETTING.description,
    voice: SETTING.voice,
  });
});

test('world fill can read its JSON from stdin, so apostrophes in names are safe', () => {
  const { run, runInput } = install();
  run('init');
  const world = goodWorld();
  world.locations.L1.name = "Smith's Forge";
  world.locations.L1.description = "Where the smith's hammer never rests and nobody ain't busy.";
  const result = runInput(JSON.stringify(world), 'world', 'fill', '--data', '-');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual([result.json.locations, result.json.npcs], [6, 7]);
  const empty = runInput('', 'world', 'fill', '--data', '-');
  assert.equal(empty.status, 1);
  assert.match(JSON.parse(empty.stderr.trim()).error, /json/i);
});

test('hero new is not advertised in the usage the Master sees', () => {
  const { run } = install();
  const result = run();
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr.trim()).error.includes('hero new'), false);
});

test('onboarding can be redone: hero create twice, then the world, until the adventure begins', () => {
  const { run } = install();
  run('init');
  assert.equal(run(...HERO_ARGS).status, 0);
  const again = run('hero', 'create', '--name', 'Legolas', '--race', 'elf', '--class', 'ranger', '--scores', '8,15,8,8,14,8');
  assert.equal(again.status, 0, again.stderr);
  assert.equal(run('hero', 'show').json.hero.name, 'Legolas');
  assert.equal(run(...SETTING_ARGS).status, 0);
  assert.equal(run('world', 'fill', '--data', JSON.stringify(goodWorld())).status, 0);
  const late = run('hero', 'create', '--name', 'Gimli', '--race', 'dwarf', '--class', 'fighter', '--scores', '15,8,14,8,8,8');
  assert.equal(late.status, 1);
  assert.match(JSON.parse(late.stderr.trim()).error, /already have a hero/i);
});

test('a stray hero new plus quest check before /play no longer blocks onboarding', () => {
  const { run } = install();
  run('init');
  assert.equal(run('hero', 'new', 'Bilbo', 'hobbit', 'rogue').status, 0);
  run('quest', 'start', 'dice-roll');
  assert.equal(run('quest', 'check', 'dice-roll').status, 0);
  assert.equal(run(...HERO_ARGS).status, 0);
  assert.equal(run(...SETTING_ARGS).status, 0);
  const fill = run('world', 'fill', '--data', JSON.stringify(goodWorld()));
  assert.equal(fill.status, 0, fill.stderr);
  assert.equal(run('world', 'status').json.complete, true);
});

const MOVE_PROBLEM = {
  title: 'Add two numbers',
  brief: 'Write solve(a, b) that returns the sum.',
  difficulty: 1,
  tests: [
    { args: [1, 2], expected: 3 },
    { args: [2, 2], expected: 4 },
    { args: [10, -3], expected: 7 },
  ],
  reference: 'export function solve(a, b) { return a + b; }',
};

test('npc warn counts warnings and a full fight can be played to the end through the CLI', () => {
  const { run } = readyGame();
  assert.deepEqual(run('npc', 'warn', 'N1', 'behind the counter').json, { ok: true, warnings: 1, mayFight: false });
  const early = run('fight', 'begin', '--npc', 'N1', '--tier', 'weak', '--aggressor', 'npc');
  assert.equal(early.status, 1);
  assert.match(JSON.parse(early.stderr.trim()).error, /warning/i);
  run('npc', 'warn', 'N1', 'again');
  assert.equal(run('npc', 'warn', 'N1', 'still').json.mayFight, true);

  const begun = run('fight', 'begin', '--npc', 'N1', '--tier', 'weak', '--aggressor', 'npc');
  assert.equal(begun.status, 0, begun.stderr);
  assert.equal(begun.json.fight.enemy.hpMax, 6);
  let state = begun.json.fight;
  for (let i = 0; i < 40 && state.status === 'open'; i++) {
    const turn = run('fight', 'attack');
    assert.equal(turn.status, 0, turn.stderr);
    state = turn.json.fight;
  }
  assert.ok(['won', 'lost'].includes(state.status), `fight ended as ${state.status}`);
  assert.equal(run('fight', 'state').json.fight, null);
  assert.equal(run('fight', 'attack').status, 1);
});

test('fight flee ends the fight, and bad tiers or aggressors exit 1', () => {
  const { run } = readyGame();
  assert.equal(run('fight', 'begin', '--npc', 'N1', '--tier', 'giant', '--aggressor', 'hero').status, 1);
  assert.equal(run('fight', 'begin', '--npc', 'N1', '--tier', 'weak', '--aggressor', 'bystander').status, 1);
  assert.equal(run('fight', 'begin', '--npc', 'N1', '--tier', 'tough', '--aggressor', 'hero').status, 0);
  assert.equal(run('fight', 'flee').json.fight.status, 'fled');
});

test('an advanced move: propose from stdin, then a correct solution wins and a wrong one loses the turn', () => {
  const { run, runInput } = readyGame();
  run('fight', 'begin', '--npc', 'N1', '--tier', 'weak', '--aggressor', 'hero');
  const proposal = runInput(JSON.stringify(MOVE_PROBLEM), 'move', 'propose', '--data', '-');
  assert.equal(proposal.status, 0, proposal.stderr);
  assert.equal(proposal.json.tests, undefined);
  writeFileSync(proposal.json.file, 'export function solve(a, b) { return a + b; }');
  const won = run('move', 'check', String(proposal.json.moveId));
  assert.equal(won.status, 0, won.stderr);
  assert.deepEqual([won.json.moveStatus, won.json.fight.status], ['won', 'won']);

  run('go', 'L2');
  run('fight', 'begin', '--npc', 'N2', '--tier', 'tough', '--aggressor', 'hero');
  const second = runInput(JSON.stringify(MOVE_PROBLEM), 'move', 'propose', '--data', '-');
  writeFileSync(second.json.file, 'export function solve(a, b) { return a - b; }');
  const lost = run('move', 'check', String(second.json.moveId));
  assert.deepEqual([lost.json.moveStatus, lost.json.fight.enemy.hp], ['failed', 26]);
});

test('a bad move problem is rejected with a readable error and nothing stored', () => {
  const { run, runInput, db } = readyGame();
  run('fight', 'begin', '--npc', 'N1', '--tier', 'weak', '--aggressor', 'hero');
  const bad = runInput(JSON.stringify({ ...MOVE_PROBLEM, reference: 'export function solve(a, b) { return 0; }' }), 'move', 'propose', '--data', '-');
  assert.equal(bad.status, 1);
  assert.match(JSON.parse(bad.stderr.trim()).error, /reference/i);
  assert.equal(count(db(), 'fight_moves'), 0);
});

test('the new combat commands reject extra arguments and foreign options', () => {
  const { run } = readyGame();
  const rejected = [
    ['fight', 'attack', 'extra'],
    ['fight', 'state', 'x'],
    ['npc', 'warn', 'N1', 'a', 'b'],
    ['fight', 'begin', '--npc', 'N1', '--tier', 'weak', '--aggressor', 'hero', '--data', 'x'],
    ['move', 'check', '1', '2'],
    ['move', 'propose', '--name', 'x'],
  ];
  for (const args of rejected) {
    const result = run(...args);
    assert.equal(result.status, 1, `${args.join(' ')} should be rejected`);
    assert.ok(JSON.parse(result.stderr.trim()).error.length > 0);
  }
});

test('tampering with the dice blocks the combat commands with exit 2', () => {
  const { env, run } = readyGame();
  appendFileSync(env.JSDND_DICE_PATH, '\n// cheat\n');
  for (const args of [['fight', 'attack'], ['npc', 'warn', 'N1'], ['move', 'check', '1']]) {
    assert.equal(run(...args).status, 2, args.join(' '));
  }
});

// Writes a status line reading straight into the DB, the way game/statusline.js does.
function setReading(game, usedPercent, minutesToReset = 120) {
  const db = game.db();
  db.prepare(
    `INSERT INTO stamina (save_id, used_percent, resets_at, read_at) VALUES (1, ?, ?, ?)
     ON CONFLICT (save_id) DO UPDATE SET used_percent = excluded.used_percent, resets_at = excluded.resets_at, read_at = excluded.read_at`,
  ).run(usedPercent, Math.floor(Date.now() / 1000) + minutesToReset * 60, Date.now());
}

test('stamina show reports the band and penalties, and rejects extra arguments', () => {
  const game = readyGame();
  assert.equal(game.run('stamina', 'show', 'x').status, 1);
  assert.equal(game.run('stamina').status, 1);
  const estimate = game.run('stamina', 'show').json;
  assert.deepEqual([estimate.estimated, estimate.band, estimate.attack, estimate.collapsed], [true, 'fresh', 0, false]);
  setReading(game, 85);
  const tired = game.run('stamina', 'show').json;
  assert.deepEqual(
    [tired.estimated, tired.band, tired.left, tired.attack, tired.ac, tired.mental, tired.collapsed],
    [false, 'weary', 15, -2, -2, true, false],
  );
});

test('look carries a stamina note and every command starts the estimate window', () => {
  const game = readyGame();
  const view = game.run('look').json;
  assert.deepEqual(view.stamina, { band: 'fresh', collapsed: false });
  assert.ok(game.db().prepare('SELECT window_started_at AS w FROM stamina WHERE save_id = 1').get().w > 0);
});

test('a tired hero swings with the attack penalty from the current band', () => {
  const attackBonusUsed = (game) => {
    game.run('fight', 'begin', '--npc', 'N1', '--tier', 'weak', '--aggressor', 'hero');
    game.run('fight', 'attack');
    const db = game.db();
    const detail = db.prepare("SELECT detail FROM fight_log WHERE actor = 'hero' AND action = 'attack'").get().detail;
    const total = Number(/\((\d+) vs AC/.exec(detail)[1]);
    const d20 = JSON.parse(db.prepare("SELECT results FROM dice_rolls WHERE context = 'hero attack'").get().results)[0];
    return total - d20;
  };
  assert.equal(attackBonusUsed(readyGame()), 5);
  const tired = readyGame();
  setReading(tired, 85);
  assert.equal(attackBonusUsed(tired), 3);
});

test('collapse blocks every play command with the place and hours, and leaves read-only ones alone', () => {
  const game = readyGame();
  game.run('fight', 'begin', '--npc', 'N1', '--tier', 'tough', '--aggressor', 'hero');
  setReading(game, 99, 150);
  const blocked = [
    ['go', 'L2'], ['talk', 'N1'], ['roll', '1d20'], ['npc', 'warn', 'N1'],
    ['fight', 'begin', '--npc', 'N1', '--tier', 'weak', '--aggressor', 'hero'], ['fight', 'attack'], ['fight', 'flee'],
    ['move', 'propose', '--data', '-'], ['move', 'check', '1'],
    ['quest', 'start', 'dice-roll'], ['quest', 'check', 'dice-roll'], ['quest', 'judge', 'dice-roll', 'clean'],
    ['quest', 'hint', 'dice-roll', 'npc_speech'], ['link', 'use', 'dice-roll', 'https://developer.mozilla.org/'],
  ];
  for (const args of blocked) {
    const result = game.run(...args);
    assert.equal(result.status, 1, args.join(' '));
    const error = JSON.parse(result.stderr.trim());
    assert.deepEqual([error.collapsed, error.location, error.hours], [true, 'Place 1', 3], args.join(' '));
    assert.match(error.error, /completely tired/i);
  }
  for (const args of [['look'], ['stamina', 'show'], ['hero', 'show'], ['honor', 'show'], ['world', 'status'], ['integrity', 'check'], ['quest', 'list'], ['fight', 'state']]) {
    assert.equal(game.run(...args).status, 0, args.join(' '));
  }
  assert.equal(game.run('fight', 'state').json.fight.status, 'open');
});

test('the open fight resumes once the reading is from a window that has reset', () => {
  const game = readyGame();
  game.run('fight', 'begin', '--npc', 'N1', '--tier', 'tough', '--aggressor', 'hero');
  setReading(game, 99);
  assert.equal(game.run('fight', 'attack').status, 1);
  setReading(game, 99, -5);
  const resumed = game.run('fight', 'attack');
  assert.equal(resumed.status, 0, resumed.stderr);
});

test('a tampered dice file still exits 2 during a collapse', () => {
  const game = readyGame();
  setReading(game, 99);
  appendFileSync(game.env.JSDND_DICE_PATH, '\n// cheat\n');
  assert.equal(game.run('go', 'L2').status, 2);
});

test('collapse also stops honor edits and the legacy fight commands', () => {
  const game = readyGame();
  setReading(game, 99);
  for (const args of [['honor', 'add', '50', 'quest', 'free honor'], ['honor', 'event', 'cheat', 'x'], ['fight', 'start', 'brawl'], ['fight', 'end', '1', 'won'], ['fight', 'log', '1', 'hero', 'attack']]) {
    const result = game.run(...args);
    assert.equal(result.status, 1, args.join(' '));
    assert.equal(JSON.parse(result.stderr.trim()).collapsed, true, args.join(' '));
  }
  assert.equal(game.run('honor', 'show').json.honor, 0);
});

test('look reports the real band and the collapse flag', () => {
  const game = readyGame();
  setReading(game, 85);
  assert.deepEqual(game.run('look').json.stamina, { band: 'weary', collapsed: false });
  setReading(game, 99);
  assert.deepEqual(game.run('look').json.stamina, { band: 'collapsed', collapsed: true });
});

test('a tired hero is hit more easily from the first enemy turn of fight begin', () => {
  const game = readyGame();
  setReading(game, 85);
  let seen = null;
  for (let i = 0; i < 80 && seen === null; i++) {
    const begun = game.run('fight', 'begin', '--npc', 'N1', '--tier', 'weak', '--aggressor', 'hero');
    const miss = begun.json.fight.log.map((l) => /misses \(\d+ vs AC (\d+)\)/.exec(l.detail ?? '')).find(Boolean);
    if (miss) seen = Number(miss[1]);
    game.run('fight', 'flee');
  }
  assert.equal(seen, 11);
});

test('move check uses the tired attack bonus for the sure hit it grants', () => {
  const game = readyGame();
  setReading(game, 85);
  game.run('fight', 'begin', '--npc', 'N1', '--tier', 'tough', '--aggressor', 'hero');
  const proposal = game.runInput(JSON.stringify(MOVE_PROBLEM), 'move', 'propose', '--data', '-');
  writeFileSync(proposal.json.file, 'export function solve(a, b) { return a + b; }');
  const won = game.run('move', 'check', String(proposal.json.moveId));
  assert.equal(won.json.moveStatus, 'won');
  const db = game.db();
  const detail = db.prepare("SELECT detail FROM fight_log WHERE actor = 'hero' AND action = 'attack'").get().detail;
  const total = Number(/\((\d+) vs AC/.exec(detail)[1]);
  const d20 = JSON.parse(db.prepare("SELECT results FROM dice_rolls WHERE context = 'hero attack'").get().results)[0];
  assert.equal(total - d20, 3);
});

function solveAllQuests(game) {
  const db = game.db();
  const playerDir = game.env.JSDND_PLAYER_DIR;
  mkdirSync(playerDir, { recursive: true });
  for (const quest of QUESTS) {
    copyFileSync(join(root, 'tests', 'quests', 'solutions', `${quest.id}.reference.js`), join(playerDir, `${quest.id}.js`));
    checkQuest(db, 1, quest.id, { playerDir, timeoutMs: 15000 });
    judgeQuest(db, 1, quest.id, 'clean', null, { playerDir });
  }
}

function unlockEnding(game) {
  solveAllQuests(game);
  const db = game.db();
  db.prepare("UPDATE heroes SET location_slot = 'L6' WHERE save_id = 1").run();
  const low = () => 0.01;
  beginFight(db, 1, { npcSlot: 'N7', tier: 'tough', aggressor: 'hero', rng: low });
  let state;
  do state = heroAttack(db, 1, { rng: low, sureHit: true, doubleDamage: true });
  while (state.status === 'open');
  return state;
}

test('the final boss is refused through the CLI until every quest is solved', () => {
  const game = readyGame();
  game.db().prepare("UPDATE heroes SET location_slot = 'L6' WHERE save_id = 1").run();
  const result = game.run('fight', 'begin', '--npc', 'N7', '--tier', 'tough', '--aggressor', 'hero');
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr.trim()).error, /final boss|quest/i);
});

test('ending build refuses while locked, builds the page when unlocked, and is not advertised', () => {
  const game = readyGame();
  const locked = game.run('ending', 'build');
  assert.equal(locked.status, 1);
  assert.equal(JSON.parse(locked.stderr.trim()).collapsed, undefined);
  assert.equal(game.run('ending', 'build', 'extra').status, 1);
  assert.equal(game.run('ending').status, 1);

  assert.equal(unlockEnding(game).endingUnlocked, true);
  const built = game.run('ending', 'build');
  assert.equal(built.status, 0, built.stderr);
  assert.match(readFileSync(built.json.file, 'utf8'), /Bilbo/);
  assert.equal(game.run('ending', 'build', 'extra').status, 1);
  assert.equal(game.run('ending', 'build', '--force').status, 1);

  const usage = game.run();
  assert.doesNotMatch(usage.stderr, /ending/i);
  setReading(game, 99);
  assert.equal(game.run('ending', 'build').status, 0);
});

test('the legacy fight end cannot close a combat fight, so the boss cannot be won on paper', () => {
  const game = readyGame();
  solveAllQuests(game);
  const db = game.db();
  db.prepare("UPDATE heroes SET location_slot = 'L6' WHERE save_id = 1").run();
  beginFight(db, 1, { npcSlot: 'N7', tier: 'tough', aggressor: 'hero', rng: () => 0.01 });
  const forged = game.run('fight', 'end', '1', 'won');
  assert.equal(forged.status, 1);
  assert.match(JSON.parse(forged.stderr.trim()).error, /fight attack|combat/i);
  assert.equal(game.run('fight', 'state').json.fight.status, 'open');
  assert.equal(game.run('ending', 'build').status, 1);
  assert.equal(game.run('fight', 'log', '1', 'hero', 'attack').status, 1);
});

test('the legacy fight commands still work for a plain logged fight', () => {
  const game = readyGame();
  const started = game.run('fight', 'start', 'a tavern brawl');
  assert.equal(game.run('fight', 'log', String(started.json.fightId), 'hero', 'swing').status, 0);
  assert.equal(game.run('fight', 'end', String(started.json.fightId), 'won').status, 0);
});
