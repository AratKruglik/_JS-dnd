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

// Friendly names players actually type.
export const ALIASES = {
  hobbit: 'halfling',
  magician: 'wizard',
  mage: 'wizard',
  'half elf': 'half-elf',
  'half orc': 'half-orc',
};

// 5e point buy: every score starts at 8, you have 27 points, and no score goes above 15.
export const POINT_BUY_COSTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;

const CUSTOM_EACH_MIN = -2;
const CUSTOM_EACH_MAX = 2;
// The same total a standard race gets: half-elf is the highest at +4 (human's +6 is spread over six abilities).
const CUSTOM_POSITIVE_TOTAL = 4;

export function resolveName(kind, name) {
  const trimmed = String(name ?? '').trim();
  const key = trimmed.toLowerCase().replace(/\s+/g, ' ');
  const resolved = ALIASES[key] ?? key;
  const known = kind === 'race' ? Object.hasOwn(STANDARD_RACES, resolved) : STANDARD_CLASSES.includes(resolved);
  return known ? { standard: true, name: resolved } : { standard: false, name: trimmed };
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
