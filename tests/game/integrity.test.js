import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealDice, checkDice } from '../../game/integrity.js';
import { applyTamperReset } from '../../game/reset.js';
import { createSave, createHero, createHeroFromChoices, getHero, ABILITIES } from '../../game/hero.js';
import { addHonorEvent, getHonor, getHonorHistory } from '../../game/honor.js';
import { startFight } from '../../game/fights.js';
import { freshDb, count } from './helpers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function sealedCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-dice-'));
  const dicePath = join(dir, 'dice.js');
  const sealPath = join(dir, 'dice.sha256');
  const rollsPath = join(dir, 'rolls.js');
  copyFileSync(join(root, 'game', 'dice.js'), dicePath);
  copyFileSync(join(root, 'game', 'rolls.js'), rollsPath);
  return { dicePath, sealPath, rollsPath, expected: sealDice(dicePath, sealPath, rollsPath) };
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

test('applyTamperReset sets level 1, base scores to 8 keeping race bonuses, and honor at the floor', () => {
  const { db, saveId } = heroSetup();
  const hero = getHero(db, saveId);
  db.prepare('UPDATE heroes SET level = 5 WHERE id = ?').run(hero.id);
  db.prepare("UPDATE hero_abilities SET base = 14, trait_adjust = 2 WHERE hero_id = ? AND ability = 'STR'").run(
    hero.id,
  );
  addHonorEvent(db, saveId, { delta: 40, kind: 'help', reason: 'good deed' });

  assert.deepEqual(applyTamperReset(db, saveId, { expected: 'aaa', found: 'bbb' }), { applied: true });

  const after = getHero(db, saveId);
  assert.equal(after.level, 1);
  for (const ability of ABILITIES) {
    const kept = ability === 'STR' ? 2 : 0;
    assert.deepEqual(after.abilities[ability], { base: 8, traitAdjust: kept });
  }
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

test('a failure in the middle of a reset rolls the whole reset back', () => {
  const { db, saveId } = heroSetup();
  addHonorEvent(db, saveId, { delta: 10, kind: 'x', reason: 'y' });
  const fightId = startFight(db, saveId, { triggerReason: 'x' });
  db.exec('UPDATE heroes SET level = 3');
  db.exec("CREATE TRIGGER boom BEFORE UPDATE ON hero_abilities BEGIN SELECT RAISE(ABORT, 'boom'); END");
  assert.throws(() => applyTamperReset(db, saveId, { expected: 'a', found: 'b' }), /boom/);
  db.exec('DROP TRIGGER boom');
  assert.equal(count(db, 'resets'), 0);
  assert.equal(getHonor(db, saveId), 10);
  assert.equal(db.prepare('SELECT outcome FROM fights WHERE id = ?').get(fightId).outcome, null);
  assert.equal(getHero(db, saveId).level, 3);
});

test('a reset keeps race bonuses (dwarf CON +2, custom race) and still resets level, scores, and honor', () => {
  const db = freshDb();
  const saveId = createSave(db, {});
  createHeroFromChoices(db, saveId, {
    name: 'Durin',
    race: 'dwarf',
    heroClass: 'fighter',
    scores: [15, 8, 14, 8, 8, 15],
  });
  applyTamperReset(db, saveId, { expected: 'a', found: 'b' });
  const dwarf = getHero(db, saveId);
  assert.deepEqual(dwarf.abilities.CON, { base: 8, traitAdjust: 2 });
  assert.deepEqual([dwarf.level, dwarf.abilities.STR.base, getHonor(db, saveId)], [1, 8, -100]);

  const other = createSave(db, {});
  createHeroFromChoices(db, other, {
    name: 'Zed',
    race: 'Zorbian',
    heroClass: 'wizard',
    scores: [8, 8, 8, 15, 8, 8],
    bonuses: { INT: 2, STR: -1 },
    raceDescription: 'Glass skin that hums.',
  });
  applyTamperReset(db, other, { expected: 'a', found: 'b' });
  const zed = getHero(db, other);
  assert.deepEqual(
    [zed.abilities.INT, zed.abilities.STR],
    [
      { base: 8, traitAdjust: 2 },
      { base: 8, traitAdjust: -1 },
    ],
  );
});

test('the fingerprint covers rolls.js: editing it is tampering, and so is a missing file or a one line seal', () => {
  const edited = sealedCopy();
  appendFileSync(edited.rollsPath, '\n// rigged\n');
  const result = checkDice({ dicePath: edited.dicePath, sealPath: edited.sealPath, rollsPath: edited.rollsPath });
  assert.deepEqual([result.ok, result.reason], [false, 'modified']);
  assert.notEqual(result.found, edited.expected);

  const gone = sealedCopy();
  rmSync(gone.rollsPath);
  const missing = checkDice({ dicePath: gone.dicePath, sealPath: gone.sealPath, rollsPath: gone.rollsPath });
  assert.deepEqual([missing.ok, missing.reason, missing.found], [false, 'missing', 'missing']);

  const half = sealedCopy();
  const [diceLine] = readFileSync(half.sealPath, 'utf8').split('\n');
  writeFileSync(half.sealPath, `${diceLine}\n`);
  const broken = checkDice({ dicePath: half.dicePath, sealPath: half.sealPath, rollsPath: half.rollsPath });
  assert.deepEqual([broken.ok, broken.reason], [false, 'seal-missing']);
});

test('the seal file has one line per sealed file, and each change gives a different fingerprint', () => {
  const sealed = sealedCopy();
  const lines = readFileSync(sealed.sealPath, 'utf8').trim().split('\n');
  assert.match(lines[0], /^dice [0-9a-f]{64}$/);
  assert.match(lines[1], /^rolls [0-9a-f]{64}$/);

  appendFileSync(sealed.dicePath, '\n// one\n');
  const diceEdit = checkDice({ dicePath: sealed.dicePath, sealPath: sealed.sealPath, rollsPath: sealed.rollsPath });
  const fresh = sealedCopy();
  appendFileSync(fresh.rollsPath, '\n// two\n');
  const rollsEdit = checkDice({ dicePath: fresh.dicePath, sealPath: fresh.sealPath, rollsPath: fresh.rollsPath });
  assert.notEqual(diceEdit.found, rollsEdit.found);

  const { db, saveId } = heroSetup();
  assert.equal(applyTamperReset(db, saveId, { expected: diceEdit.expected, found: diceEdit.found }).applied, true);
  assert.equal(applyTamperReset(db, saveId, { expected: diceEdit.expected, found: diceEdit.found }).applied, false);
  assert.equal(applyTamperReset(db, saveId, { expected: rollsEdit.expected, found: rollsEdit.found }).applied, true);
});

test('node game/seal.js seals both files into the seal file', () => {
  const { dicePath, sealPath, rollsPath } = sealedCopy();
  rmSync(sealPath);
  const run = spawnSync('node', [join(root, 'game', 'seal.js')], {
    encoding: 'utf8',
    env: { ...process.env, JSDND_DICE_PATH: dicePath, JSDND_DICE_SEAL: sealPath, JSDND_ROLLS_PATH: rollsPath },
  });
  assert.equal(run.status, 0, run.stderr);
  const lines = readFileSync(sealPath, 'utf8').trim().split('\n');
  assert.deepEqual(
    lines.map((l) => l.split(' ')[0]),
    ['dice', 'rolls'],
  );
  assert.equal(checkDice({ dicePath, sealPath, rollsPath }).ok, true);
});

test('the real seal matches the real dice.js and rolls.js', () => {
  assert.equal(checkDice().ok, true);
});
