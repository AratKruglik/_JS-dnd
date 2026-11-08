import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startQuest, checkQuest, declineStyle } from '../../game/quests.js';
import { createSave, createHero } from '../../game/hero.js';
import { getHonor } from '../../game/honor.js';
import { HONOR_RULES } from '../../game/honor-rules.js';
import { applyTamperReset } from '../../game/reset.js';
import { GENERAL_STYLE } from '../../quests/style.js';
import { freshDb } from './helpers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const installed = existsSync(join(root, 'node_modules', '.bin', 'prettier'));
const options = { skip: installed ? false : 'run npm install to enable the style checks' };

// Passes the shout check but breaks the style: var and double quotes, no semicolons.
const MESSY = 'export function shout(text) {\n  var t = text.trim().toUpperCase()\n  return t + "!"\n}\n';
const NEAT =
  'export function shout(text) {\n  const trimmed = text.trim().toUpperCase();\n  return `${trimmed}!`;\n}\n';

function setup(code = MESSY) {
  const db = freshDb();
  const saveId = createSave(db, {});
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-qstyle-'));
  writeFileSync(join(playerDir, 'string-shout.js'), code);
  return { db, saveId, playerDir, opts: { playerDir, timeoutMs: 15000 } };
}

test('the general style list has the nine directions, and quest start hands it over with the specific ones', () => {
  assert.equal(GENERAL_STYLE.length, 9);
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-qstart-'));
  const started = startQuest('string-shout', { playerDir: dir });
  assert.deepEqual(started.style.general, GENERAL_STYLE);
  assert.ok(Array.isArray(started.style.specific));
});

test('the style_declined honor rule is a small hit', () => {
  assert.equal(HONOR_RULES.style_declined, -2);
});

test('checkQuest reports style only when asked and only after a pass', options, () => {
  const { db, saveId, opts } = setup();
  assert.equal('style' in checkQuest(db, saveId, 'string-shout', opts), false);
  const asked = checkQuest(db, saveId, 'string-shout', { ...opts, style: true });
  assert.equal(asked.status, 'pass');
  assert.equal(asked.style.ok, false);
  assert.ok(asked.style.problems.length >= 2);

  const broken = setup('export function shout() { return "nope"; }\n');
  const failed = checkQuest(broken.db, broken.saveId, 'string-shout', { ...broken.opts, style: true });
  assert.equal(failed.status, 'fail');
  assert.equal('style' in failed, false);

  const neat = setup(NEAT);
  assert.deepEqual(checkQuest(neat.db, neat.saveId, 'string-shout', { ...neat.opts, style: true }).style, {
    ran: true,
    ok: true,
    problems: [],
  });
});

test('declining to fix the style costs a little honor, once per solve', options, () => {
  const { db, saveId, opts } = setup();
  checkQuest(db, saveId, 'string-shout', opts);
  const declined = declineStyle(db, saveId, 'string-shout', opts);
  assert.equal(declined.honor, -2);
  assert.equal(getHonor(db, saveId), -2);
  assert.throws(() => declineStyle(db, saveId, 'string-shout', opts), /already/i);
  assert.equal(getHonor(db, saveId), -2);
});

test(
  'there is nothing to decline when the style is clean, the quest is not passed, or the tools are missing',
  options,
  () => {
    const neat = setup(NEAT);
    checkQuest(neat.db, neat.saveId, 'string-shout', neat.opts);
    assert.throws(() => declineStyle(neat.db, neat.saveId, 'string-shout', neat.opts), /nothing to decline|clean/i);

    const messy = setup();
    assert.throws(() => declineStyle(messy.db, messy.saveId, 'string-shout', messy.opts), /passing attempt|check/i);

    checkQuest(messy.db, messy.saveId, 'string-shout', messy.opts);
    const emptyRoot = mkdtempSync(join(tmpdir(), 'jsdnd-notools-'));
    assert.throws(
      () => declineStyle(messy.db, messy.saveId, 'string-shout', { ...messy.opts, styleRoot: emptyRoot }),
      /not available|npm install/i,
    );
    assert.equal(getHonor(messy.db, messy.saveId), 0);
  },
);

test('a tamper reset starts a new epoch, so the style can be declined again', options, () => {
  const { db, saveId, opts } = setup();
  createHero(db, saveId, { name: 'Bilbo', race: 'halfling', heroClass: 'rogue' });
  checkQuest(db, saveId, 'string-shout', opts);
  declineStyle(db, saveId, 'string-shout', opts);
  applyTamperReset(db, saveId, { expected: 'a', found: 'b' });
  checkQuest(db, saveId, 'string-shout', opts);
  declineStyle(db, saveId, 'string-shout', opts);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM honor_events WHERE kind = 'style_declined'").get().n, 2);
});
