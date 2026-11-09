import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeSeconds, collectStats } from '../../game/ending-stats.js';
import { beginFight, heroAttack } from '../../game/combat-engine.js';
import { createSave, createHero, createHeroFromChoices } from '../../game/hero.js';
import { setSetting, fillWorld } from '../../game/world.js';
import { checkQuest, judgeQuest } from '../../game/quests.js';
import { applyTamperReset } from '../../game/reset.js';
import { addHonorEvent, getHonor } from '../../game/honor.js';
import { QUESTS } from '../../quests/index.js';
import { questText } from '../../quests/text/index.js';
import { freshDb, markSolved } from './helpers.js';
import { SETTING, goodWorld } from './world-fixtures.js';

const solutions = join(resolve(dirname(fileURLToPath(import.meta.url))), '..', 'quests', 'solutions');
const MIN = 60 * 1000;
const HERO = { name: 'Bilbo', race: 'hobbit', heroClass: 'rogue', scores: [8, 15, 14, 8, 8, 15] };
const LOW = () => 0.01;

test('activeSeconds adds gaps of 30 minutes or less and ignores the rest', () => {
  assert.equal(activeSeconds([]), 0);
  assert.equal(activeSeconds([5 * MIN]), 0);
  assert.equal(activeSeconds([MIN, MIN, MIN]), 0);
  assert.equal(activeSeconds([10 * MIN, 0, 5 * MIN]), 10 * 60);
  assert.equal(activeSeconds([0, 30 * MIN]), 30 * 60);
  assert.equal(activeSeconds([0, 30 * MIN + 1]), 0);
  assert.equal(activeSeconds([0, 10 * MIN, 41 * MIN, 50 * MIN]), 19 * 60);
});

test('activeSeconds ignores junk timestamps and never returns NaN or a negative number', () => {
  const result = activeSeconds([0, Number.NaN, -5 * MIN, undefined, null, 'x', Infinity, 4 * MIN]);
  assert.equal(result, 4 * 60);
  assert.equal(activeSeconds([Number.NaN, Number.NaN]), 0);
  assert.ok(activeSeconds([0, 1e15]) === 0);
});

test('hours come from the union of every timestamp the game writes', () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  const at = (m) => new Date(Date.UTC(2026, 10, 8, 10, m)).toISOString();
  db.prepare("INSERT INTO dice_rolls (save_id, created_at, spec, results, total) VALUES (?, ?, '1d20', '[5]', 5)").run(
    saveId,
    at(0),
  );
  db.prepare(
    "INSERT INTO honor_events (save_id, created_at, delta, kind, reason, honor_after) VALUES (?, ?, 1, 'x', 'y', 1)",
  ).run(saveId, at(10));
  db.prepare(
    "INSERT INTO quest_hints (save_id, quest_id, created_at, epoch, kind) VALUES (?, 'dice-roll', ?, 0, 'npc_speech')",
  ).run(saveId, at(20));
  db.prepare("INSERT INTO fights (save_id, started_at, trigger_reason) VALUES (?, ?, 'x')").run(saveId, at(55));
  const stats = collectStats(db, saveId);
  assert.equal(stats.minutes, 20);
  assert.equal(stats.hoursEstimated, 0.3);
});

test('an empty save gives zeros and empty lists, and no hero gives null', () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  assert.deepEqual(collectStats(db, saveId), {
    hero: null,
    setting: null,
    minutes: 0,
    hoursEstimated: 0,
    enemiesDefeated: 0,
    fights: 0,
    falls: 0,
    tasks: { solved: 0, total: QUESTS.length, list: [] },
    honor: [],
    complexity: [],
  });
});

test('stats after a real run: solves, a win, a fall, and the honor and complexity series', () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  createHeroFromChoices(db, saveId, HERO);
  setSetting(db, saveId, SETTING);
  fillWorld(db, saveId, goodWorld());
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-stats-'));
  for (const quest of QUESTS) {
    copyFileSync(join(solutions, `${quest.id}.reference.js`), join(playerDir, `${quest.id}.js`));
    checkQuest(db, saveId, quest.id, { playerDir, timeoutMs: 15000 });
    judgeQuest(db, saveId, quest.id, 'clean', null, { playerDir });
  }
  beginFight(db, saveId, { npcSlot: 'N1', tier: 'weak', aggressor: 'hero', rng: LOW });
  let state;
  do state = heroAttack(db, saveId, { rng: LOW, sureHit: true, doubleDamage: true });
  while (state.status === 'open');
  addHonorEvent(db, saveId, { delta: 3, kind: 'kindness', reason: 'shared bread' });

  let stats = collectStats(db, saveId);
  assert.deepEqual([stats.hero.name, stats.hero.race, stats.setting.name], ['Bilbo', 'halfling', 'Neon Harbor']);
  assert.deepEqual([stats.enemiesDefeated, stats.fights, stats.falls], [1, 1, 0]);
  assert.deepEqual([stats.tasks.solved, stats.tasks.total, stats.tasks.list.length], [3, 3, 3]);
  assert.deepEqual(
    stats.tasks.list.map((t) => t.id),
    QUESTS.map((q) => q.id),
  );
  assert.equal(stats.tasks.list[0].title, questText(QUESTS[0].id, 'en').title);
  assert.equal(stats.tasks.list[0].rung, QUESTS[0].rung);
  let running = 0;
  assert.deepEqual(
    stats.complexity.map((c) => c.cumulative),
    QUESTS.map((q) => (running += q.complexity)),
  );
  const honorTimes = stats.honor.map((h) => h.at);
  assert.deepEqual(honorTimes, [...honorTimes].sort());
  assert.equal(stats.honor.at(-1).honor, getHonor(db, saveId));
  assert.ok(stats.honor.some((h) => h.kind === 'kindness'));

  applyTamperReset(db, saveId, { expected: 'a', found: 'b' });
  stats = collectStats(db, saveId);
  assert.deepEqual([stats.falls, stats.tasks.solved, stats.tasks.list.length, stats.enemiesDefeated], [1, 0, 3, 1]);
  assert.deepEqual(stats.honor.at(-1).honor, -100);
  assert.equal(stats.honor.at(-1).kind, 'reset');
});

// One row in one source table ten minutes after an anchor row. If the source is not collected,
// the gap never forms and the minutes stay at 0.
const SOURCE_ROWS = {
  heroes: (db, s, at) => {
    createHero(db, s, { name: 'Bilbo', race: 'hobbit', heroClass: 'rogue' });
    db.prepare('UPDATE heroes SET created_at = ? WHERE save_id = ?').run(at(10), s);
  },
  dice_rolls: (db, s, at) =>
    db
      .prepare("INSERT INTO dice_rolls (save_id, created_at, spec, results, total) VALUES (?, ?, '1d20', '[5]', 5)")
      .run(s, at(10)),
  honor_events: (db, s, at) =>
    db
      .prepare(
        "INSERT INTO honor_events (save_id, created_at, delta, kind, reason, honor_after) VALUES (?, ?, 1, 'x', 'y', 1)",
      )
      .run(s, at(10)),
  resets: (db, s, at) =>
    db
      .prepare(
        "INSERT INTO resets (save_id, created_at, reason, fingerprint_expected, fingerprint_found) VALUES (?, ?, 'x', 'a', 'b')",
      )
      .run(s, at(10)),
  quest_attempts: (db, s, at) => attempt(db, s, at(10)),
  quest_judgments: (db, s, at) =>
    db
      .prepare("INSERT INTO quest_judgments (attempt_id, created_at, verdict) VALUES (?, ?, 'clean')")
      .run(attempt(db, s, at(0)), at(10)),
  quest_solves: (db, s, at) =>
    db
      .prepare(
        "INSERT INTO quest_solves (save_id, quest_id, attempt_id, solved_at, epoch, hints_used, complexity) VALUES (?, 'dice-roll', ?, ?, 0, 0, 1)",
      )
      .run(s, attempt(db, s, at(0)), at(10)),
  quest_hints: (db, s, at) =>
    db
      .prepare(
        "INSERT INTO quest_hints (save_id, quest_id, created_at, epoch, kind) VALUES (?, 'dice-roll', ?, 0, 'npc_speech')",
      )
      .run(s, at(10)),
  fights_started: (db, s, at) =>
    db.prepare("INSERT INTO fights (save_id, started_at, trigger_reason) VALUES (?, ?, 'x')").run(s, at(10)),
  fights_ended: (db, s, at) =>
    db
      .prepare(
        "INSERT INTO fights (save_id, started_at, ended_at, trigger_reason, outcome) VALUES (?, ?, ?, 'x', 'fled')",
      )
      .run(s, at(0), at(10)),
  fight_log: (db, s, at) =>
    db
      .prepare("INSERT INTO fight_log (fight_id, seq, created_at, actor, action) VALUES (?, 1, ?, 'hero', 'hit')")
      .run(fight(db, s, at(0)), at(10)),
  fight_moves: (db, s, at) =>
    db
      .prepare(
        "INSERT INTO fight_moves (fight_id, created_at, title, brief, difficulty, tests, status) VALUES (?, ?, 't', 'b', 1, '[]', 'open')",
      )
      .run(fight(db, s, at(0)), at(10)),
};

function attempt(db, saveId, when) {
  return Number(
    db
      .prepare(
        "INSERT INTO quest_attempts (save_id, quest_id, created_at, status, expected, got, message, complexity) VALUES (?, 'dice-roll', ?, 'pass', '', '', '', 1)",
      )
      .run(saveId, when).lastInsertRowid,
  );
}

function fight(db, saveId, when) {
  return Number(
    db.prepare("INSERT INTO fights (save_id, started_at, trigger_reason) VALUES (?, ?, 'x')").run(saveId, when)
      .lastInsertRowid,
  );
}

for (const [source, addRow] of Object.entries(SOURCE_ROWS)) {
  test(`hours count the ${source} timestamps, for that save only`, () => {
    const db = freshDb();
    const mine = createSave(db, {});
    const other = createSave(db, {});
    const at = (m) => new Date(Date.UTC(2026, 10, 8, 10, m)).toISOString();
    // The anchor is a honor event, or a dice roll when the honor events are the source under test.
    const anchor = (saveId) =>
      source === 'honor_events'
        ? db
            .prepare(
              "INSERT INTO dice_rolls (save_id, created_at, spec, results, total) VALUES (?, ?, '1d20', '[5]', 5)",
            )
            .run(saveId, at(0))
        : db
            .prepare(
              "INSERT INTO honor_events (save_id, created_at, delta, kind, reason, honor_after) VALUES (?, ?, 1, 'x', 'y', 1)",
            )
            .run(saveId, at(0));
    anchor(mine);
    addRow(db, mine, at);
    assert.equal(collectStats(db, mine).minutes, 10, `${source} was not counted`);

    const lonely = createSave(db, {});
    anchor(lonely);
    addRow(db, other, at);
    assert.equal(collectStats(db, lonely).minutes, 0, `${source} leaked in from another save`);
  });
}

test('a revoked solve is not listed as solved and does not feed the complexity chart', () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  markSolved(db, saveId, 'dice-roll', '2026-11-08T10:00:00.000Z');
  markSolved(db, saveId, 'string-shout', '2026-11-08T10:05:00.000Z');
  db.prepare("UPDATE quest_solves SET revoked_at = '2026-11-08T10:10:00.000Z' WHERE quest_id = 'string-shout'").run();
  const stats = collectStats(db, saveId);
  assert.deepEqual(
    stats.tasks.list.map((t) => t.id),
    ['dice-roll'],
  );
  assert.equal(stats.complexity.length, 1);
  assert.equal(stats.tasks.solved, 1);
});
