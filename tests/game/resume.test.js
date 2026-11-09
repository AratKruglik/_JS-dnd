import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGameDb } from '../../game/db.js';
import { createSave, createHeroFromChoices } from '../../game/hero.js';
import { setSetting, fillWorld } from '../../game/world.js';
import { setLanguage, packFor } from '../../game/i18n.js';
import { beginFight, heroAttack } from '../../game/combat-engine.js';
import { grantItem } from '../../game/inventory.js';
import { resumeState, stateLine } from '../../game/resume.js';
import { SETTING, goodWorld } from './world-fixtures.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HERO = { name: 'Bilbo', race: 'hobbit', heroClass: 'fighter', scores: [8, 15, 14, 8, 8, 15] };

const script = (...pairs) => {
  let i = 0;
  return () => {
    const [value, sides] = pairs[i++];
    return (value - 0.5) / sides;
  };
};

// A save on disk, so the same data can be read by the library, the command line, and the hook.
function install({ hero = true, world = true, language = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-resume-'));
  const dbPath = join(dir, 'game.db');
  const db = openGameDb(dbPath);
  const saveId = createSave(db, { name: 'Save 1' });
  if (hero) createHeroFromChoices(db, saveId, HERO);
  if (hero && world) {
    setSetting(db, saveId, SETTING);
    fillWorld(db, saveId, goodWorld());
  }
  if (language) setLanguage(db, saveId, language);
  const env = { ...process.env, JSDND_GAME_DB: dbPath };
  const cli = (...args) => {
    const result = spawnSync('node', [join(root, 'game', 'cli.js'), ...args], { env, encoding: 'utf8' });
    return { ...result, json: result.stdout.trim() ? JSON.parse(result.stdout) : null };
  };
  const hook = (payload) =>
    spawnSync('node', [join(root, 'game', 'play-hook.js')], { env, encoding: 'utf8', input: JSON.stringify(payload) });
  return { db, saveId, env, cli, hook };
}

// The hero is hurt by a normal enemy and left at 6 of 12 HP in an open fight.
function hurtInFight(db, saveId) {
  beginFight(db, saveId, {
    npcSlot: 'N1',
    tier: 'normal',
    aggressor: 'hero',
    rng: script([15, 20], [10, 20]),
  });
  heroAttack(db, saveId, { rng: script([3, 20], [15, 20], [6, 6]) });
}

const L1 = goodWorld().locations.L1.name;

test('the resume state carries the language, the pack, the vitals, and the display names', () => {
  const { db, saveId } = install();
  const state = resumeState(db, saveId);
  assert.equal(state.language, null);
  assert.deepEqual(state.pack, packFor('en'));
  assert.deepEqual(state.vitals, { hp: 12, maxHp: 12, gold: 0, items: 0 });
  assert.equal(state.hero.name, 'Bilbo');
  assert.deepEqual([state.hero.raceDisplay, state.hero.classDisplay], ['Halfling', 'Fighter']);
  for (const key of ['hero', 'world', 'setting', 'here', 'quests', 'fight', 'honor', 'stamina'])
    assert.ok(key in state, key);
});

test('a Ukrainian save gets the Ukrainian pack and display names, and vitals follow gold and items', () => {
  const { db, saveId } = install({ language: 'uk' });
  db.prepare('UPDATE heroes SET gold = 15 WHERE save_id = ?').run(saveId);
  grantItem(db, saveId, { source: 'quest', questId: 'dice-roll' });
  const state = resumeState(db, saveId);
  assert.equal(state.language, 'uk');
  assert.deepEqual(state.pack, packFor('uk'));
  assert.ok(state.pack.glossary.length > 0);
  assert.deepEqual([state.hero.raceDisplay, state.hero.classDisplay], ['напіврослик', 'воїн']);
  assert.deepEqual(state.vitals, { hp: 12, maxHp: 12, gold: 15, items: 1 });
});

test('with no hero the state has no hero and no vitals, and an English pack', () => {
  const { db, saveId } = install({ hero: false });
  const state = resumeState(db, saveId);
  assert.equal(state.hero, null);
  assert.equal(state.vitals, null);
  assert.deepEqual(state.pack, packFor('en'));
  assert.equal(state.here, null);
});

test('the state line gives place, health, gold, quests, fight, stamina, and honor, in English', () => {
  const { db, saveId } = install();
  assert.equal(
    stateLine(db, saveId),
    `[game] at ${L1} (L1) | HP 12/12 | 0 gold | quests 0/3, next dice-roll | no fight | stamina fresh | honor 0`,
  );
});

test('the state line stays in English labels for a Ukrainian save, and shows an open fight', () => {
  const { db, saveId } = install({ language: 'uk' });
  db.prepare('UPDATE heroes SET gold = 15 WHERE save_id = ?').run(saveId);
  hurtInFight(db, saveId);
  assert.equal(
    stateLine(db, saveId),
    `[game] at ${L1} (L1) | HP 6/12 | 15 gold | quests 0/3, next dice-roll | fight: hero 6/12 HP vs ${goodWorld().npcs.N1.name} 14/14 HP | stamina fresh | honor 0`,
  );
});

test('the state line shows a collapsed hero, and is null before the hero and the world exist', () => {
  const { db, saveId } = install();
  db.prepare('INSERT INTO stamina (save_id, used_percent, resets_at, read_at) VALUES (?, 99, ?, ?)').run(
    saveId,
    Math.floor(Date.now() / 1000) + 100 * 60,
    Date.now(),
  );
  assert.match(stateLine(db, saveId), /\| stamina collapsed for \d+h \| honor 0$/);
  const bare = install({ hero: false });
  assert.equal(stateLine(bare.db, bare.saveId), null);
  const noWorld = install({ world: false });
  assert.equal(stateLine(noWorld.db, noWorld.saveId), null);
});

test('the resume command prints the whole resume state and nothing different', () => {
  const { db, saveId, cli } = install({ language: 'uk' });
  const result = cli('resume');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.json, JSON.parse(JSON.stringify({ ok: true, saveId, ...resumeState(db, saveId) })));
  assert.equal(result.json.language, 'uk');
  assert.ok(result.json.pack.glossary.length > 0);
  assert.equal(result.json.vitals.maxHp, 12);
  assert.equal(result.json.hero.classDisplay, 'воїн');
});

test('the compaction dump is the full resume state, with the pack and the vitals, in both languages', () => {
  for (const language of ['en', 'uk']) {
    const { db, saveId, hook } = install({ language });
    hook({ session_id: 'game', hook_event_name: 'UserPromptSubmit', prompt: '/play' });
    const out = hook({ session_id: 'game', hook_event_name: 'SessionStart', source: 'compact' });
    assert.equal(out.status, 0, out.stderr);
    const dump = JSON.parse(out.stdout.slice(out.stdout.indexOf('{')));
    assert.deepEqual(dump, JSON.parse(JSON.stringify(resumeState(db, saveId))));
    assert.equal(dump.language, language);
    assert.deepEqual(dump.pack, packFor(language));
    assert.equal(dump.vitals.maxHp, 12);
  }
});

test('the per-prompt line from the hook carries health and gold', () => {
  const { hook } = install();
  hook({ session_id: 'game', hook_event_name: 'UserPromptSubmit', prompt: '/play' });
  const line = hook({ session_id: 'game', hook_event_name: 'UserPromptSubmit', prompt: 'I walk on' }).stdout.trim();
  assert.match(line, /\| HP 12\/12 \| 0 gold \|/);
});
