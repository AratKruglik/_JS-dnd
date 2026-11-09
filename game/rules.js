import { names as enNames } from './locales/en.js';
import { names as ukNames } from './locales/uk.js';

export const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

// 5e SRD races and their ability score bonuses. Half-elf is fixed (CHA +2, DEX +1, CON +1)
// because 5e lets the player pick the two +1s and a fixed pick keeps the game simple.
export const STANDARD_RACES = {
  human: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 },
  elf: { DEX: 2 },
  dwarf: { CON: 2 },
  halfling: { DEX: 2 },
  gnome: { INT: 2 },
  'half-elf': { CHA: 2, DEX: 1, CON: 1 },
  'half-orc': { STR: 2, CON: 1 },
  tiefling: { CHA: 2, INT: 1 },
  dragonborn: { STR: 2, CHA: 1 },
};

export const STANDARD_CLASSES = [
  'barbarian',
  'bard',
  'cleric',
  'druid',
  'fighter',
  'monk',
  'paladin',
  'ranger',
  'rogue',
  'sorcerer',
  'warlock',
  'wizard',
];

// The hit die of each standard class (5e). Max HP at level 1 is the die plus the CON modifier.
// A custom class has no table entry and gets the default die.
export const HIT_DICE = {
  barbarian: 12,
  bard: 8,
  cleric: 8,
  druid: 8,
  fighter: 10,
  monk: 8,
  paladin: 10,
  ranger: 10,
  rogue: 8,
  sorcerer: 6,
  warlock: 8,
  wizard: 6,
};
export const DEFAULT_HIT_DIE = 8;
export const hitDie = (heroClass) => (Object.hasOwn(HIT_DICE, heroClass) ? HIT_DICE[heroClass] : DEFAULT_HIT_DIE);

// Names players type, in both languages. Matching flattens case, spacing, and apostrophe variants.
const NAME_TABLES = { en: enNames, uk: ukNames };

export const normalizeName = (text) =>
  String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/\s+/g, ' ');

// normalized text (a key, a display name, or an alias, in any language) -> the stable English key
const LOOKUP = { race: new Map(), class: new Map() };
for (const [kind, group] of [
  ['race', 'races'],
  ['class', 'classes'],
]) {
  for (const names of Object.values(NAME_TABLES)) {
    for (const [key, entry] of Object.entries(names[group])) {
      for (const text of [key, entry.name, ...entry.aliases]) LOOKUP[kind].set(normalizeName(text), key);
    }
  }
}

// The English aliases as one map, kept for the rules commands: hobbit -> halfling and the rest.
export const ALIASES = Object.fromEntries(
  ['races', 'classes'].flatMap((group) =>
    Object.entries(enNames[group]).flatMap(([key, entry]) => entry.aliases.map((alias) => [alias, key])),
  ),
);

// How a standard pick is shown in a language. A custom pick is shown exactly as the player typed it.
export function displayName(kind, key, lang) {
  const group = kind === 'race' ? 'races' : 'classes';
  return NAME_TABLES[lang]?.[group]?.[key]?.name ?? key;
}

export const aliasesFor = (kind, key, lang) =>
  NAME_TABLES[lang]?.[kind === 'race' ? 'races' : 'classes']?.[key]?.aliases ?? [];

// 5e point buy: every score starts at 8, you have 27 points, and no score goes above 15.
export const POINT_BUY_COSTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;

const CUSTOM_EACH_MIN = -2;
const CUSTOM_EACH_MAX = 2;
// The same total a standard race gets: half-elf is the highest at +4 (human's +6 is spread over six abilities).
const CUSTOM_POSITIVE_TOTAL = 4;

export function resolveName(kind, name) {
  const trimmed = String(name ?? '').trim();
  const key = LOOKUP[kind].get(normalizeName(trimmed));
  return key ? { standard: true, name: key } : { standard: false, name: trimmed };
}

export function validatePointBuy(scores) {
  const errors = [];
  if (!Array.isArray(scores) || scores.length !== ABILITIES.length) {
    return {
      ok: false,
      spent: 0,
      errors: [`Give exactly ${ABILITIES.length} scores, one per ability (${ABILITIES.join(', ')}).`],
    };
  }
  let spent = 0;
  scores.forEach((score, i) => {
    if (!Number.isInteger(score) || score < 8 || score > 15) {
      errors.push(`${ABILITIES[i]} must be a whole number from 8 to 15, got ${JSON.stringify(score)}.`);
    } else {
      spent += POINT_BUY_COSTS[score];
    }
  });
  if (errors.length === 0 && spent > POINT_BUY_BUDGET) {
    errors.push(`That spends ${spent} points but you only have ${POINT_BUY_BUDGET}.`);
  }
  return { ok: errors.length === 0, spent: errors.length === 0 ? spent : 0, errors };
}

export function validateCustomBonuses(bonuses) {
  if (bonuses === null || typeof bonuses !== 'object' || Array.isArray(bonuses)) {
    return { ok: false, errors: ['Bonuses must be an object like { STR: 2, DEX: 1 }.'] };
  }
  const errors = [];
  let positives = 0;
  for (const [ability, value] of Object.entries(bonuses)) {
    if (!ABILITIES.includes(ability)) {
      errors.push(`Unknown ability "${ability}". Use ${ABILITIES.join(', ')}.`);
    } else if (!Number.isInteger(value) || value < CUSTOM_EACH_MIN || value > CUSTOM_EACH_MAX) {
      errors.push(
        `${ability} bonus must be a whole number from ${CUSTOM_EACH_MIN} to ${CUSTOM_EACH_MAX}, got ${JSON.stringify(value)}.`,
      );
    } else if (value > 0) {
      positives += value;
    }
  }
  if (errors.length === 0 && positives > CUSTOM_POSITIVE_TOTAL) {
    errors.push(
      `Positive bonuses add up to ${positives}, but the most a custom race gets is ${CUSTOM_POSITIVE_TOTAL}.`,
    );
  }
  return { ok: errors.length === 0, errors };
}
