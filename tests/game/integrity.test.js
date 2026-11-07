import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealDice, checkDice } from '../../game/integrity.js';
import { applyTamperReset } from '../../game/reset.js';
import { createSave, createHero, getHero, ABILITIES } from '../../game/hero.js';
import { addHonorEvent, getHonor, getHonorHistory } from '../../game/honor.js';
import { startFight } from '../../game/fights.js';
import { freshDb, count } from './helpers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function sealedCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-dice-'));
  const dicePath = join(dir, 'dice.js');
  const sealPath = join(dir, 'dice.sha256');
  copyFileSync(join(root, 'game', 'dice.js'), dicePath);
  return { dicePath, sealPath, expected: sealDice(dicePath, sealPath) };
}

function heroSetup() {
  const db = freshDb();
  const saveId = createSave(db, {});
  createHero(db, saveId, { name: 'Bilbo', race: 'hobbit', heroClass: 'rogue' });
  return { db, saveId };
}

test('the sealed hash matches game/dice.js', () => {
  const result = checkDice({
    dicePath: join(root, 'game', 'dice.js'),
    sealPath: join(root, 'game', 'dice.sha256'),
  });
  assert.equal(result.ok, true, 'game/dice.js changed without re-sealing: run `node game/seal.js`');
});

test('checkDice passes on an untouched sealed copy', () => {
  const { dicePath, sealPath } = sealedCopy();
  assert.deepEqual(checkDice({ dicePath, sealPath }), { ok: true });
});

test('checkDice reports modified when one byte changes', () => {
  const { dicePath, sealPath, expected } = sealedCopy();
  appendFileSync(dicePath, '\n');
  const result = checkDice({ dicePath, sealPath });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'modified');
  assert.equal(result.expected, expected);
  assert.notEqual(result.found, expected);
  assert.match(result.found, /^[0-9a-f]{64}$/);
});

test('checkDice reports missing when the dice file is gone', () => {
  const { dicePath, sealPath, expected } = sealedCopy();
  rmSync(dicePath);
  assert.deepEqual(checkDice({ dicePath, sealPath }), {
    ok: false,
    reason: 'missing',
    expected,
    found: 'missing',
  });
});

test('checkDice reports seal-missing when there is no seal file', () => {
  const { dicePath, sealPath } = sealedCopy();
  rmSync(sealPath);
  const result = checkDice({ dicePath, sealPath });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'seal-missing');
  assert.equal(result.expected, null);
});

test('applyTamperReset sets level 1, abilities 8 with no trait adjust, and honor at the floor', () => {
  const { db, saveId } = heroSetup();
  const hero = getHero(db, saveId);
  db.prepare('UPDATE heroes SET level = 5 WHERE id = ?').run(hero.id);
  db.prepare("UPDATE hero_abilities SET base = 14, trait_adjust = 2 WHERE hero_id = ? AND ability = 'STR'").run(hero.id);
  addHonorEvent(db, saveId, { delta: 40, kind: 'help', reason: 'good deed' });

  assert.deepEqual(applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' }), { applied: true });

  const after = getHero(db, saveId);
  assert.equal(after.level, 1);
  for (const ability of ABILITIES) assert.deepEqual(after.abilities[ability], { base: 8, traitAdjust: 0 });
  assert.equal(getHonor(db, saveId), -100);
  const last = getHonorHistory(db, saveId).at(-1);
  assert.deepEqual([last.kind, last.delta, last.honorAfter], ['reset', -140, -100]);
});

test('applyTamperReset keeps name, race, class, earlier honor events, and fights', () => {
  const { db, saveId } = heroSetup();
  addHonorEvent(db, saveId, { delta: 5, kind: 'greet', reason: 'said hello' });
  startFight(db, saveId, { triggerReason: 'test' });
  applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' });

  const hero = getHero(db, saveId);
  assert.deepEqual([hero.name, hero.race, hero.heroClass], ['Bilbo', 'hobbit', 'rogue']);
  const history = getHonorHistory(db, saveId);
  assert.equal(history.length, 2);
  assert.equal(history[0].reason, 'said hello');
  assert.equal(count(db, 'fights'), 1);
});

test('applyTamperReset is idempotent per fingerprint', () => {
  const { db, saveId } = heroSetup();
  applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' });
  const honorRows = count(db, 'honor_events');
  assert.deepEqual(applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' }), { applied: false });
  assert.equal(count(db, 'resets'), 1);
  assert.equal(count(db, 'honor_events'), honorRows);
});

test('a new tampered fingerprint resets again', () => {
  const { db, saveId } = heroSetup();
  applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' });
  assert.deepEqual(applyTamperReset(db, saveId, { expected: 'aaa', found: 'ccc' }), { applied: true });
  assert.equal(count(db, 'resets'), 2);
});

test('applyTamperReset is atomic', () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  assert.throws(() => applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' }), /no hero/i);
  assert.equal(count(db, 'resets'), 0);
  assert.equal(count(db, 'honor_events'), 0);
});

test('honor stays consistent across a reset', () => {
  const { db, saveId } = heroSetup();
  applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' });
  assert.equal(getHonor(db, saveId), -100);
  assert.equal(addHonorEvent(db, saveId, { delta: 10, kind: 'help', reason: 'starting over' }), -90);
});

test('.gitattributes pins dice.js line endings so every clone hashes the same bytes', () => {
  const attributes = readFileSync(join(root, '.gitattributes'), 'utf8');
  assert.match(attributes, /^game\/dice\.js\s+.*eol=lf/m);
});

test('game/seal.js seals the file at JSDND_DICE_PATH', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-seal-'));
  const dicePath = join(dir, 'dice.js');
  const sealPath = join(dir, 'dice.sha256');
  copyFileSync(join(root, 'game', 'dice.js'), dicePath);
  const result = spawnSync('node', [join(root, 'game', 'seal.js')], {
    env: { ...process.env, JSDND_DICE_PATH: dicePath, JSDND_DICE_SEAL: sealPath },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(checkDice({ dicePath, sealPath }), { ok: true });
});
