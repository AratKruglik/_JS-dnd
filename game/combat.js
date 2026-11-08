import { rollAndLog } from './rolls.js';

// Pure combat math plus the three roll helpers. Every roll goes through the dice script and
// is logged, so the AI never invents one. The numbers here are placeholders the owner can tune.
export const abilityMod = (score) => Math.floor((score - 10) / 2);

const total = (hero, ability) => hero.abilities[ability].base + hero.abilities[ability].traitAdjust;

// `modifiers` lets tiredness (Plan 6) shift attack and AC without touching this file.
export function heroStats(hero, modifiers = {}) {
  const dex = abilityMod(total(hero, 'DEX'));
  const best = Math.max(abilityMod(total(hero, 'STR')), dex);
  return {
    maxHp: 10 + abilityMod(total(hero, 'CON')),
    ac: 10 + dex + (modifiers.ac ?? 0),
    attackBonus: best + 2 + (modifiers.attack ?? 0),
    damageMod: best,
  };
}

export const ENEMY_TIERS = {
  weak: { hp: 6, ac: 10, attack: 2, die: 4 },
  normal: { hp: 14, ac: 12, attack: 3, die: 6 },
  tough: { hp: 26, ac: 14, attack: 4, die: 8 },
};

// A natural 20 always hits (and crits), a natural 1 always misses.
export function attackRoll(db, saveId, bonus, targetAc, rng, context = 'attack') {
  const rolled = rollAndLog(db, saveId, '1d20', context, rng);
  const d20 = rolled.results[0];
  const sum = d20 + bonus;
  const hit = d20 === 20 ? true : d20 === 1 ? false : sum >= targetAc;
  return { rollId: rolled.id, d20, total: sum, hit, crit: d20 === 20 };
}

export function damageRoll(db, saveId, die, mod, crit, rng, context = 'damage') {
  const rolled = rollAndLog(db, saveId, `${crit ? 2 : 1}d${die}`, context, rng);
  return { rollId: rolled.id, rolls: rolled.results, damage: Math.max(1, rolled.total + mod) };
}

export function initiativeRoll(db, saveId, dexMod, rng, context = 'initiative') {
  const rolled = rollAndLog(db, saveId, '1d20', context, rng);
  return { rollId: rolled.id, total: rolled.results[0] + dexMod };
}
