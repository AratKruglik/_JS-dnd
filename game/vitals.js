import { inTransaction } from './db.js';
import { getHero } from './hero.js';
import { maxHpFor } from './hero-stats.js';
import { SKELETON } from '../world/skeleton.js';

// The hero's health and gold. Health is stored as a number once the hero is first hurt, and a null
// means full. It comes back by itself, one point per REGEN_MS of real time, except in an open fight.
export const REGEN_MS = 30 * 60 * 1000;
export const REST_COST = 5;
// A clean solve heals this share of the maximum, at least one point.
export const SOLVE_HEAL_SHARE = 0.25;

const isoAt = (ms) => new Date(ms).toISOString();
const whole = (value) => Number.isSafeInteger(value);

const fightOpen = (db, saveId) =>
  Boolean(
    db.prepare('SELECT 1 FROM fights WHERE save_id = ? AND ended_at IS NULL AND enemy_hp IS NOT NULL').get(saveId),
  );

// Health as it is at `nowMs`, and the clock position it leaves behind. Pure: it writes nothing.
function regenerated(row, maxHp, nowMs, open) {
  if (row.hp === null || row.hp >= maxHp) return { hp: maxHp, clock: nowMs };
  const since = row.hp_updated_at === null ? nowMs : Date.parse(row.hp_updated_at);
  if (open || !Number.isFinite(since) || since > nowMs) return { hp: row.hp, clock: since };
  const gained = Math.floor((nowMs - since) / REGEN_MS);
  if (row.hp + gained >= maxHp) return { hp: maxHp, clock: nowMs };
  return { hp: row.hp + gained, clock: since + gained * REGEN_MS };
}

const heroRow = (db, saveId) => db.prepare('SELECT hp, gold, hp_updated_at FROM heroes WHERE save_id = ?').get(saveId);

// What the status line and the Master show. Null when there is no hero.
export function readVitals(db, saveId, nowMs = Date.now()) {
  const hero = getHero(db, saveId);
  if (!hero) return null;
  const maxHp = maxHpFor(hero);
  const row = heroRow(db, saveId);
  return { hp: regenerated(row, maxHp, nowMs, fightOpen(db, saveId)).hp, maxHp, gold: row.gold };
}

function requireHero(db, saveId) {
  const hero = getHero(db, saveId);
  if (!hero) throw new Error('No hero yet. Create one first.');
  return { hero, maxHp: maxHpFor(hero) };
}

// Stores the regenerated health. Call it before anything that reads or changes health.
export function syncHp(db, saveId, nowMs = Date.now()) {
  return inTransaction(db, () => {
    const { maxHp } = requireHero(db, saveId);
    const { hp, clock } = regenerated(heroRow(db, saveId), maxHp, nowMs, fightOpen(db, saveId));
    db.prepare('UPDATE heroes SET hp = ?, hp_updated_at = ? WHERE save_id = ?').run(hp, isoAt(clock), saveId);
    return { hp, maxHp };
  });
}

// Sets health exactly and restarts the regeneration clock. Used when a fight changes it.
export function setHp(db, saveId, hp, nowMs = Date.now()) {
  const { maxHp } = requireHero(db, saveId);
  db.prepare('UPDATE heroes SET hp = ?, hp_updated_at = ? WHERE save_id = ?').run(
    Math.min(maxHp, Math.max(0, hp)),
    isoAt(nowMs),
    saveId,
  );
}

export const fullHeal = (db, saveId, nowMs = Date.now()) => setHp(db, saveId, Infinity, nowMs);

export function healHero(db, saveId, amount, nowMs = Date.now()) {
  if (!whole(amount) || amount < 1) throw new Error('Healing must be a whole number of at least 1.');
  return inTransaction(db, () => {
    const { hp, maxHp } = syncHp(db, saveId, nowMs);
    const healed = Math.min(maxHp, hp + amount);
    setHp(db, saveId, healed, nowMs);
    return { hp: healed, maxHp };
  });
}

export function healForSolve(db, saveId, nowMs = Date.now()) {
  const { maxHp } = requireHero(db, saveId);
  return healHero(db, saveId, Math.max(1, Math.floor(maxHp * SOLVE_HEAL_SHARE)), nowMs);
}

// Gold never goes below zero. Returns the new total.
export function addGold(db, saveId, amount) {
  if (!whole(amount)) throw new Error('Gold must be a whole number.');
  return inTransaction(db, () => {
    requireHero(db, saveId);
    const next = Math.max(0, heroRow(db, saveId).gold + amount);
    db.prepare('UPDATE heroes SET gold = ? WHERE save_id = ?').run(next, saveId);
    return next;
  });
}

// A full heal for gold, at the starting place, when hurt, outside a fight.
export function restHero(db, saveId, nowMs = Date.now()) {
  return inTransaction(db, () => {
    const { hero } = requireHero(db, saveId);
    if (fightOpen(db, saveId)) throw new Error('The hero cannot rest in the middle of a fight.');
    if (hero.locationSlot !== SKELETON.start) {
      throw new Error(`The hero can only rest at the start (${SKELETON.start}).`);
    }
    const { hp, maxHp } = syncHp(db, saveId, nowMs);
    if (hp >= maxHp) throw new Error('The hero is at full health and needs no rest.');
    const { gold } = heroRow(db, saveId);
    if (gold < REST_COST) throw new Error(`A rest costs ${REST_COST} gold and the hero has ${gold}.`);
    db.prepare('UPDATE heroes SET gold = gold - ? WHERE save_id = ?').run(REST_COST, saveId);
    fullHeal(db, saveId, nowMs);
    return { hp: maxHp, maxHp, gold: gold - REST_COST, cost: REST_COST };
  });
}
