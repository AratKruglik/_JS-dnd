import { hitDie } from './rules.js';

// Pure hero math with no dice behind it, so the tamper reset and the status line can use it even when
// game/dice.js or game/rolls.js is missing or broken.
export const abilityMod = (score) => Math.floor((score - 10) / 2);

export const abilityTotal = (hero, ability) => hero.abilities[ability].base + hero.abilities[ability].traitAdjust;

// Level 1 maximum: the class hit die plus the CON modifier, at least 1.
export const maxHpFor = (hero) => Math.max(1, hitDie(hero.heroClass) + abilityMod(abilityTotal(hero, 'CON')));
