import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFight, logFightStep, endFight, getFightLog } from '../../game/fights.js';
import { rollAndLog } from '../../game/rolls.js';
import { createSave } from '../../game/hero.js';
import { freshDb, count } from './helpers.js';

const setup = () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  return { db, saveId, fightId: startFight(db, saveId, { triggerReason: 'shopkeeper warned twice' }) };
};

test('startFight creates an open fight with no outcome', () => {
  const { db, fightId } = setup();
  const row = db.prepare('SELECT * FROM fights WHERE id = ?').get(fightId);
  assert.equal(row.trigger_reason, 'shopkeeper warned twice');
  assert.equal(row.ended_at, null);
  assert.equal(row.outcome, null);
});

test('logFightStep numbers steps 1, 2, 3 with no gaps', () => {
  const { db, fightId } = setup();
  const seqs = ['a', 'b', 'c'].map((action) => logFightStep(db, fightId, { actor: 'hero', action }));
  assert.deepEqual(seqs, [1, 2, 3]);
});

test('logFightStep links a dice roll and rejects an unknown roll id', () => {
  const { db, saveId, fightId } = setup();
  const rolled = rollAndLog(db, saveId, '1d20', 'attack', () => 0.5);
  logFightStep(db, fightId, { actor: 'hero', action: 'swing', rollId: rolled.id });
  assert.equal(getFightLog(db, fightId)[0].rollId, rolled.id);
  assert.throws(() => logFightStep(db, fightId, { actor: 'hero', action: 'swing', rollId: 9999 }));
  assert.equal(getFightLog(db, fightId).length, 1);
});

test('logFightStep on an ended fight throws and writes nothing', () => {
  const { db, fightId } = setup();
  endFight(db, fightId, 'fled');
  assert.throws(() => logFightStep(db, fightId, { actor: 'hero', action: 'late swing' }));
  assert.equal(count(db, 'fight_log'), 0);
});

test('endFight twice throws', () => {
  const { db, fightId } = setup();
  endFight(db, fightId, 'won');
  assert.throws(() => endFight(db, fightId, 'lost'));
  const row = db.prepare('SELECT outcome, ended_at FROM fights WHERE id = ?').get(fightId);
  assert.equal(row.outcome, 'won');
  assert.ok(row.ended_at);
});

test('getFightLog returns steps in seq order', () => {
  const { db, fightId } = setup();
  logFightStep(db, fightId, { actor: 'hero', action: 'first', detail: 'opening' });
  logFightStep(db, fightId, { actor: 'goblin', action: 'second' });
  const log = getFightLog(db, fightId);
  assert.deepEqual(
    log.map((s) => [s.seq, s.actor, s.action, s.detail]),
    [
      [1, 'hero', 'first', 'opening'],
      [2, 'goblin', 'second', null],
    ],
  );
});

test('seq is unique per fight', () => {
  const { db, fightId } = setup();
  logFightStep(db, fightId, { actor: 'hero', action: 'first' });
  assert.throws(() =>
    db
      .prepare("INSERT INTO fight_log (fight_id, seq, created_at, actor, action) VALUES (?, 1, 'now', 'x', 'y')")
      .run(fightId),
  );
});
