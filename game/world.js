import { inTransaction } from './db.js';
import { lintVoice } from './voice.js';
import { SKELETON } from '../world/skeleton.js';

const SOURCES = ['offered', 'customized', 'written'];
const now = () => new Date().toISOString();

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The world is locked as soon as the player attempts a quest, so names never change mid-game.
function assertNotStarted(db, saveId) {
  if (db.prepare('SELECT 1 FROM quest_attempts WHERE save_id = ? LIMIT 1').get(saveId)) {
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

export function worldStatus(db, saveId) {
  const settingSet = Boolean(db.prepare('SELECT 1 FROM world_settings WHERE save_id = ?').get(saveId));
  const locationsFilled = db.prepare('SELECT COUNT(*) AS n FROM world_locations WHERE save_id = ?').get(saveId).n;
  const npcsFilled = db.prepare('SELECT COUNT(*) AS n FROM world_npcs WHERE save_id = ?').get(saveId).n;
  const locationsTotal = SKELETON.locations.length;
  const npcsTotal = SKELETON.npcs.length;
  const missing = [];
  if (!settingSet) missing.push('setting');
  if (locationsFilled < locationsTotal) missing.push('locations');
  if (npcsFilled < npcsTotal) missing.push('npcs');
  return { settingSet, locationsFilled, locationsTotal, npcsFilled, npcsTotal, missing, complete: missing.length === 0 };
}
