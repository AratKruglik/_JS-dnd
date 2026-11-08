const FIXED = [
  [[1, 2, 3, 4], 6],
  [[], 0],
  [[-2, 3], -2],
  [[1, 3], 0],
];

const reference = (numbers) => numbers.filter((n) => n % 2 === 0).reduce((sum, n) => sum + n, 0);
const pick = (n) => Math.floor(Math.random() * n);
const randomNumbers = () => Array.from({ length: pick(9) }, () => pick(41) - 20);

const miss = (input, wanted, gave) => ({
  pass: false,
  expected: `sumEven(${JSON.stringify(input)}) gives ${wanted}`,
  got: `sumEven(${JSON.stringify(input)}) gave ${gave}`,
});

export default {
  id: 'array-sum',
  title: 'Count the even ones',
  rung: 1,
  complexity: 2,
  file: 'player/array-sum.js',
  brief:
    'Write a function sumEven(numbers). It receives an array of whole numbers and returns the total of only the even ones. An empty array gives 0.',
  stub: `// Quest: count the even ones.
// Export sumEven(numbers): add up only the even numbers in the array and return the total.
// An empty array, or one with no even numbers, gives 0.
export function sumEven(numbers) {
  // your code here
}
`,

  async check(mod) {
    if (typeof mod.sumEven !== 'function') {
      return { pass: false, expected: 'an exported function sumEven', got: `sumEven is ${typeof mod.sumEven}` };
    }
    const cases = [...FIXED];
    for (let i = 0; i < 20; i++) {
      const input = randomNumbers();
      cases.push([input, reference(input)]);
    }
    for (const [input, wanted] of cases) {
      const gave = mod.sumEven([...input]);
      if (gave !== wanted) return miss(input, wanted, gave);
    }
    return { pass: true, expected: 'the right totals', got: 'the right totals' };
  },
};
