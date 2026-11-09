import { missingExport, wrongResult, passed } from './messages.js';

const FIXED = [
  [[1, 2, 3, 4], 6],
  [[], 0],
  [[-2, 3], -2],
  [[1, 3], 0],
];

const reference = (numbers) => numbers.filter((n) => n % 2 === 0).reduce((sum, n) => sum + n, 0);
const pick = (n) => Math.floor(Math.random() * n);
const randomNumbers = () => Array.from({ length: pick(9) }, () => pick(41) - 20);

// The title, brief, and starter file for this quest are in quests/text.
export default {
  id: 'array-sum',
  rung: 1,
  complexity: 2,

  async check(mod) {
    if (typeof mod.sumEven !== 'function') return missingExport('sumEven', typeof mod.sumEven);
    const cases = [...FIXED];
    for (let i = 0; i < 20; i++) {
      const input = randomNumbers();
      cases.push([input, reference(input)]);
    }
    for (const [input, wanted] of cases) {
      const gave = mod.sumEven([...input]);
      if (gave !== wanted) return wrongResult(`sumEven(${JSON.stringify(input)})`, wanted, gave);
    }
    return passed('check.pass.totals');
  },
};
