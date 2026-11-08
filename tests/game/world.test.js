import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setSetting, fillWorld, worldStatus } from '../../game/world.js';
import { createSave } from '../../game/hero.js';
import { freshDb, count } from './helpers.js';

const setup = () => {
  const db = freshDb();
  return { db, saveId: createSave(db, {}) };
};

const SETTING = {
  source: 'offered',
  name: 'Neon Harbor',
  description: 'A rain-soaked port city where every deal is brokered over noodle steam.',
  voice: 'Clipped, wry, street-smart. Short sentences, dry jokes, no lectures.',
};

function goodWorld(prefix = '') {
  const locations = {};
  const npcs = {};
  ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'].forEach((slot, i) => {
    locations[slot] = { name: `${prefix}Place ${i + 1}`, description: `A dripping corner of the harbor, number ${i + 1}.` };
  });
  ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'].forEach((slot, i) => {
    npcs[slot] = {
      name: `${prefix}Person ${i + 1}`,
      description: `A wary local, number ${i + 1}.`,
      voice: 'Mumbles, trails off, squints at everything.',
    };
  });
  return { locations, npcs };
}

const rows = (db) => [count(db, 'world_locations'), count(db, 'world_npcs')];

test('setSetting stores the setting and a second call replaces it before play', () => {
  const { db, saveId } = setup();
  setSetting(db, saveId, SETTING);
  setSetting(db, saveId, { ...SETTING, source: 'customized', name: 'Neon Docks' });
  assert.equal(count(db, 'world_settings'), 1);
  const row = db.prepare('SELECT * FROM world_settings').get();
  assert.deepEqual([row.source, row.name], ['customized', 'Neon Docks']);
});

test('setSetting rejects an unknown source, empty fields, and banned phrases', () => {
  const { db, saveId } = setup();
  assert.throws(() => setSetting(db, saveId, { ...SETTING, source: 'random' }), /source/i);
  for (const key of ['name', 'description', 'voice']) {
    assert.throws(() => setSetting(db, saveId, { ...SETTING, [key]: '  ' }), new RegExp(key, 'i'));
  }
  assert.throws(() => setSetting(db, saveId, { ...SETTING, description: 'Great question, traveler.' }), /great question/i);
  assert.equal(count(db, 'world_settings'), 0);
});

test('fillWorld stores all 6 locations and 6 npcs in one call', () => {
  const { db, saveId } = setup();
  assert.deepEqual(fillWorld(db, saveId, goodWorld()), { locations: 6, npcs: 6 });
  assert.deepEqual(rows(db), [6, 6]);
});

test('fillWorld is atomic: bad input writes nothing and names the problem', () => {
  const { db, saveId } = setup();
  const missing = goodWorld();
  delete missing.locations.L3;
  const unknown = goodWorld();
  unknown.npcs.N9 = { name: 'Ghost', description: 'x', voice: 'y' };
  const dupe = goodWorld();
  dupe.locations.L2.name = dupe.locations.L1.name;
  const empty = goodWorld();
  empty.npcs.N2.voice = '';
  const banned = goodWorld();
  banned.npcs.N4.description = 'I hope this helps you on your quest.';
  const notObject = { locations: [], npcs: {} };

  const cases = [
    [missing, /L3/],
    [unknown, /N9/],
    [dupe, /duplicate|same name/i],
    [empty, /N2.*voice|voice.*N2/i],
    [banned, /i hope this helps/i],
    [notObject, /locations/i],
  ];
  for (const [data, pattern] of cases) {
    assert.throws(() => fillWorld(db, saveId, data), pattern);
    assert.deepEqual(rows(db), [0, 0], `nothing may be written for ${pattern}`);
  }
});

test('a rejected refill leaves the earlier world untouched', () => {
  const { db, saveId } = setup();
  fillWorld(db, saveId, goodWorld());
  const bad = goodWorld('Other ');
  bad.locations.L1.description = '';
  assert.throws(() => fillWorld(db, saveId, bad));
  assert.equal(db.prepare("SELECT name FROM world_locations WHERE slot = 'L1'").get().name, 'Place 1');
  assert.deepEqual(rows(db), [6, 6]);
});

test('fillWorld again before play replaces the world cleanly', () => {
  const { db, saveId } = setup();
  fillWorld(db, saveId, goodWorld());
  fillWorld(db, saveId, goodWorld('New '));
  assert.deepEqual(rows(db), [6, 6]);
  assert.equal(db.prepare("SELECT name FROM world_npcs WHERE slot = 'N1'").get().name, 'New Person 1');
});

test('the world is locked after the first quest attempt', () => {
  const { db, saveId } = setup();
  fillWorld(db, saveId, goodWorld());
  db.prepare(
    "INSERT INTO quest_attempts (save_id, quest_id, created_at, status, expected, got, message, complexity) VALUES (?, 'dice-roll', 'now', 'fail', '', '', '', 2)",
  ).run(saveId);
  assert.throws(() => fillWorld(db, saveId, goodWorld('New ')), /locked|started/i);
  assert.throws(() => setSetting(db, saveId, SETTING), /locked|started/i);
  assert.equal(db.prepare("SELECT name FROM world_npcs WHERE slot = 'N1'").get().name, 'Person 1');
});

test('worldStatus reports missing pieces and is complete only with setting, 6 locations, and 6 npcs', () => {
  const { db, saveId } = setup();
  assert.deepEqual(worldStatus(db, saveId), {
    settingSet: false,
    locationsFilled: 0,
    locationsTotal: 6,
    npcsFilled: 0,
    npcsTotal: 6,
    missing: ['setting', 'locations', 'npcs'],
    complete: false,
  });
  setSetting(db, saveId, SETTING);
  assert.deepEqual(worldStatus(db, saveId).missing, ['locations', 'npcs']);
  fillWorld(db, saveId, goodWorld());
  assert.deepEqual(worldStatus(db, saveId), {
    settingSet: true,
    locationsFilled: 6,
    locationsTotal: 6,
    npcsFilled: 6,
    npcsTotal: 6,
    missing: [],
    complete: true,
  });
});
