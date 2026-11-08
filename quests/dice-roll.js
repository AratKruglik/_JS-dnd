const SIDES = [4, 6, 8, 10, 12, 20, 100];

const miss = (call, wanted, gave) => ({
  pass: false,
  expected: `${call} gives ${wanted}`,
  got: `${call} gave ${gave}`,
});

export default {
  id: 'dice-roll',
  title: 'Roll your own die',
  rung: 1,
  complexity: 2,
  file: 'player/dice-roll.js',
  brief:
    'Write a function rollDie(sides, rng) that rolls one die. rng is a function that gives a number from 0 up to, but not including, 1 (it defaults to Math.random). Return a whole number from 1 to sides. Read game/dice.js first to see how the game does it, then write your own version.',
  stub: `// Quest: roll your own die.
// Export rollDie(sides, rng). rng() gives a number from 0 up to (not including) 1.
// Return a whole number from 1 to sides. Read game/dice.js for inspiration, but write your own.
export function rollDie(sides, rng = Math.random) {
  // your code here
}
`,

  async check(mod) {
    if (typeof mod.rollDie !== 'function') {
      return { pass: false, expected: 'an exported function rollDie', got: `rollDie is ${typeof mod.rollDie}` };
    }
    const { rollDie } = mod;

    for (const sides of [6, 20]) {
      const low = rollDie(sides, () => 0);
      if (low !== 1) return miss(`rollDie(${sides}, () => 0)`, 1, low);
      const high = rollDie(sides, () => 0.999999);
      if (high !== sides) return miss(`rollDie(${sides}, () => 0.999999)`, sides, high);
    }

    // Generated inputs: a hardcoded answer cannot survive these.
    for (let i = 0; i < 28; i++) {
      const sides = SIDES[i % SIDES.length];
      const r = Math.random();
      const wanted = Math.floor(r * sides) + 1;
      const gave = rollDie(sides, () => r);
      if (gave !== wanted) return miss(`rollDie(${sides}, () => ${r})`, wanted, gave);
    }

    const seen = new Set();
    for (let i = 0; i < 600; i++) {
      const value = rollDie(6);
      if (!Number.isInteger(value) || value < 1 || value > 6) {
        return miss('rollDie(6)', 'a whole number from 1 to 6', value);
      }
      seen.add(value);
    }
    if (seen.size !== 6) {
      return {
        pass: false,
        expected: '600 rolls of rollDie(6) show all six faces',
        got: `faces seen: ${[...seen].sort().join(', ')}`,
      };
    }
    return { pass: true, expected: 'a fair die', got: 'a fair die' };
  },
};
