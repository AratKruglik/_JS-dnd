import { inTransaction } from './db.js';
import { getHero } from './hero.js';
import { getProgress } from './quests.js';
import { requireAwake } from './knockouts.js';
import { lintVoice } from './voice.js';
import { worldStatus } from './world-status.js';
import { SKELETON } from '../world/skeleton.js';
import { QUESTS } from '../quests/index.js';

const SOURCES = ['offered', 'customized', 'written'];
const now = () => new Date().toISOString();

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The world is locked once onboarding is finished (setting and world complete) and the player
// has attempted a quest, so names never change mid-game. A stray attempt made before the world
// exists does not lock anything, so onboarding can always be finished.
function assertNotStarted(db, saveId) {
  const attempted = db.prepare('SELECT 1 FROM quest_attempts WHERE save_id = ? LIMIT 1').get(saveId);
  if (attempted && worldStatus(db, saveId).complete) {
    throw new Error('The game has started (a quest was attempted), so the world is locked.');
  }
}

// Collects problems for one text field: empty, wrong type, or banned AI-speak.
function checkText(problems, label, value) {
  if (typeof value !== 'string' || !value.trim()) {
    problems.push(`${label} must not be empty.`);
    return;
  }
  const { hits } = lintVoice(value);
  for (const hit of hits) problems.push(`${label} contains the banned phrase "${hit}". Rewrite it in the setting's voice.`);
}

export function setSetting(db, saveId, { source, name, description, voice }) {
  const problems = [];
  if (!SOURCES.includes(source)) problems.push(`Unknown source "${source}". Use one of: ${SOURCES.join(', ')}.`);
  checkText(problems, 'Setting name', name);
  checkText(problems, 'Setting description', description);
  checkText(problems, 'Setting voice', voice);
  if (problems.length) throw new Error(problems.join(' '));

  assertNotStarted(db, saveId);
  inTransaction(db, () => {
    db.prepare('DELETE FROM world_settings WHERE save_id = ?').run(saveId);
    db.prepare(
      'INSERT INTO world_settings (save_id, created_at, source, name, description, voice) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(saveId, now(), source, name.trim(), description.trim(), voice.trim());
  });
}

function checkSlots(problems, kind, given, wanted) {
  if (!isPlainObject(given)) {
    problems.push(`${kind}s must be an object keyed by slot (${wanted.join(', ')}).`);
    return false;
  }
  for (const slot of wanted) if (!isPlainObject(given[slot])) problems.push(`Missing ${kind} ${slot}.`);
  for (const slot of Object.keys(given)) if (!wanted.includes(slot)) problems.push(`Unknown ${kind} slot ${slot}.`);
  return true;
}

function checkUniqueNames(problems, kind, given) {
  const seen = new Map();
  for (const [slot, entry] of Object.entries(given)) {
    const name = typeof entry?.name === 'string' ? entry.name.trim().toLowerCase() : null;
    if (!name) continue;
    if (seen.has(name)) problems.push(`Duplicate ${kind} name "${entry.name}" (${seen.get(name)} and ${slot}).`);
    else seen.set(name, slot);
  }
}

// Stores the Master's whole world in one transaction. Nothing is written unless every slot is valid.
export function fillWorld(db, saveId, data) {
  const locationSlots = SKELETON.locations.map((l) => l.slot);
  const npcSlots = SKELETON.npcs.map((n) => n.slot);
  const problems = [];

  const locations = isPlainObject(data) ? data.locations : undefined;
  const npcs = isPlainObject(data) ? data.npcs : undefined;
  const locationsOk = checkSlots(problems, 'location', locations, locationSlots);
  const npcsOk = checkSlots(problems, 'npc', npcs, npcSlots);

  if (locationsOk) {
    for (const slot of locationSlots) {
      if (!isPlainObject(locations[slot])) continue;
      checkText(problems, `Location ${slot} name`, locations[slot].name);
      checkText(problems, `Location ${slot} description`, locations[slot].description);
    }
    checkUniqueNames(problems, 'location', locations);
  }
  if (npcsOk) {
    for (const slot of npcSlots) {
      if (!isPlainObject(npcs[slot])) continue;
      checkText(problems, `NPC ${slot} name`, npcs[slot].name);
      checkText(problems, `NPC ${slot} description`, npcs[slot].description);
      checkText(problems, `NPC ${slot} voice`, npcs[slot].voice);
    }
    checkUniqueNames(problems, 'npc', npcs);
  }
  if (problems.length) throw new Error(problems.join(' '));

  assertNotStarted(db, saveId);
  inTransaction(db, () => {
    db.prepare('DELETE FROM world_locations WHERE save_id = ?').run(saveId);
    db.prepare('DELETE FROM world_npcs WHERE save_id = ?').run(saveId);
    const insertLocation = db.prepare(
      'INSERT INTO world_locations (save_id, slot, name, description) VALUES (?, ?, ?, ?)',
    );
    for (const slot of locationSlots) {
      insertLocation.run(saveId, slot, locations[slot].name.trim(), locations[slot].description.trim());
    }
    const insertNpc = db.prepare(
      'INSERT INTO world_npcs (save_id, slot, name, description, voice) VALUES (?, ?, ?, ?, ?)',
    );
    for (const slot of npcSlots) {
      insertNpc.run(saveId, slot, npcs[slot].name.trim(), npcs[slot].description.trim(), npcs[slot].voice.trim());
    }
  });
  return { locations: locationSlots.length, npcs: npcSlots.length };
}

export { worldStatus };

// What the Master needs to recall the world's voice when a saved game is resumed.
export function getSetting(db, saveId) {
  const row = db
    .prepare('SELECT source, name, description, voice FROM world_settings WHERE save_id = ?')
    .get(saveId);
  return row ? { source: row.source, name: row.name, description: row.description, voice: row.voice } : null;
}

// Everything below needs a hero and a finished world.
function requireReady(db, saveId) {
  const hero = getHero(db, saveId);
  if (!hero) throw new Error('No hero yet. Create one first.');
  const status = worldStatus(db, saveId);
  if (!status.complete) throw new Error(`The world is not ready yet (missing: ${status.missing.join(', ')}).`);
  return hero;
}

const locationRow = (db, saveId, slot) => {
  const row = db
    .prepare('SELECT slot, name, description FROM world_locations WHERE save_id = ? AND slot = ?')
    .get(saveId, slot);
  return { slot: row.slot, name: row.name, description: row.description };
};

const skeletonLocation = (slot) => SKELETON.locations.find((l) => l.slot === slot);

export function look(db, saveId) {
  const hero = requireReady(db, saveId);
  const here = skeletonLocation(hero.locationSlot);
  const npcNames = db.prepare('SELECT slot, name FROM world_npcs WHERE save_id = ?').all(saveId);
  return {
    location: locationRow(db, saveId, here.slot),
    exits: here.exits.map((slot) => {
      const row = locationRow(db, saveId, slot);
      return { slot, name: row.name };
    }),
    npcs: SKELETON.npcs
      .filter((n) => n.location === here.slot)
      .map((n) => ({ slot: n.slot, name: npcNames.find((r) => r.slot === n.slot).name })),
  };
}

// target is an exit slot (L2) or an exit name, case-insensitive.
export function go(db, saveId, target) {
  const hero = requireReady(db, saveId);
  const here = skeletonLocation(hero.locationSlot);
  const wanted = String(target ?? '').trim().toLowerCase();
  const exits = here.exits.map((slot) => locationRow(db, saveId, slot));
  const destination = wanted && exits.find((e) => e.slot.toLowerCase() === wanted || e.name.toLowerCase() === wanted);
  if (!destination) {
    const current = locationRow(db, saveId, here.slot);
    throw new Error(
      `"${target}" is not an exit from ${current.name}. Exits: ${exits.map((e) => `${e.slot} ${e.name}`).join(', ')}.`,
    );
  }
  db.prepare('UPDATE heroes SET location_slot = ? WHERE save_id = ?').run(destination.slot, saveId);
  return { location: { slot: destination.slot, name: destination.name } };
}

// A quest holder offers their quest only when every earlier quest is solved in the current
// epoch and this one is not solved yet.
export function talk(db, saveId, npcSlot) {
  const hero = requireReady(db, saveId);
  const spot = SKELETON.npcs.find((n) => n.slot === String(npcSlot ?? '').trim().toUpperCase());
  if (!spot || spot.location !== hero.locationSlot) throw new Error(`${npcSlot} is not here.`);

  requireAwake(db, saveId, spot.slot);
  const npc = db
    .prepare('SELECT slot, name, description, voice FROM world_npcs WHERE save_id = ? AND slot = ?')
    .get(saveId, spot.slot);

  let offer = null;
  if (spot.questId) {
    const { solved } = getProgress(db, saveId);
    const index = QUESTS.findIndex((q) => q.id === spot.questId);
    const earlierSolved = QUESTS.slice(0, index).every((q) => solved.includes(q.id));
    if (earlierSolved && !solved.includes(spot.questId)) {
      const quest = QUESTS[index];
      offer = { questId: quest.id, title: quest.title, brief: quest.brief };
    }
  }
  return { npc: { slot: npc.slot, name: npc.name, description: npc.description, voice: npc.voice }, offer };
}
