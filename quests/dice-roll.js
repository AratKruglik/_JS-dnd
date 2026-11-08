import { missingExport, wrongResult, outOfRange, allFacesMissing, passed } from './messages.js';

const SIDES = [4, 6, 8, 10, 12, 20, 100];

// The title, brief, and starter file for this quest are in quests/text.
export default {
  id: 'dice-roll',
  rung: 1,
  complexity: 2,

  async check(mod) {
    if (typeof mod.rollDie !== 'function') return missingExport('rollDie', typeof mod.rollDie);
    const { rollDie } = mod;

    for (const sides of [6, 20]) {
      const low = rollDie(sides, () => 0);
      if (low !== 1) return wrongResult(`rollDie(${sides}, () => 0)`, 1, low);
      const high = rollDie(sides, () => 0.999999);
      if (high !== sides) return wrongResult(`rollDie(${sides}, () => 0.999999)`, sides, high);
    }

    // Generated inputs: a hardcoded answer cannot survive these.
    for (let i = 0; i < 28; i++) {
      const sides = SIDES[i % SIDES.length];
      const r = Math.random();
      const wanted = Math.floor(r * sides) + 1;
      const gave = rollDie(sides, () => r);
      if (gave !== wanted) return wrongResult(`rollDie(${sides}, () => ${r})`, wanted, gave);
    }

    const seen = new Set();
    for (let i = 0; i < 600; i++) {
      const value = rollDie(6);
      if (!Number.isInteger(value) || value < 1 || value > 6) return outOfRange('rollDie(6)', 6, value);
      seen.add(value);
    }
    if (seen.size !== 6) return allFacesMissing([...seen].sort().join(', '));
    return passed('check.pass.fairDie');
  },
};
