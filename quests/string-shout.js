const FIXED = [
  ['hello', 'HELLO!'],
  ['  hi there ', 'HI THERE!'],
  ['', '!'],
];

const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const pick = (n) => Math.floor(Math.random() * n);

function randomText() {
  const word = Array.from({ length: 3 + pick(8) }, () => letters[pick(letters.length)]).join('');
  return `${' '.repeat(pick(3))}${word}${' '.repeat(pick(3))}`;
}

const miss = (input, wanted, gave) => ({
  pass: false,
  expected: `shout(${JSON.stringify(input)}) gives ${JSON.stringify(wanted)}`,
  got: `shout(${JSON.stringify(input)}) gave ${JSON.stringify(gave)}`,
});

export default {
  id: 'string-shout',
  title: 'Make some noise',
  rung: 1,
  complexity: 1,
  file: 'player/string-shout.js',
  brief:
    'Write a function shout(text). It removes spaces from both ends of the text, makes it all capital letters, and puts an exclamation mark on the end.',
  stub: `// Quest: make some noise.
// Export shout(text): trim the spaces off both ends, make it ALL CAPS, and add a "!" at the end.
export function shout(text) {
  // your code here
}
`,

  async check(mod) {
    if (typeof mod.shout !== 'function') {
      return { pass: false, expected: 'an exported function shout', got: `shout is ${typeof mod.shout}` };
    }
    const cases = [...FIXED];
    for (let i = 0; i < 20; i++) {
      const input = randomText();
      cases.push([input, `${input.trim().toUpperCase()}!`]);
    }
    for (const [input, wanted] of cases) {
      const gave = mod.shout(input);
      if (gave !== wanted) return miss(input, wanted, gave);
    }
    return { pass: true, expected: 'loud text', got: 'loud text' };
  },
};
