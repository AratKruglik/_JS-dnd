import { missingExport, wrongResult, passed } from './messages.js';

const FIXED = [
  ['hello', 'HELLO!'],
  // Test input for the player's function, not text the player reads.
  // eslint-disable-next-line no-restricted-syntax
  ['  hi there ', 'HI THERE!'],
  ['', '!'],
];

const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const pick = (n) => Math.floor(Math.random() * n);

function randomText() {
  const word = Array.from({ length: 3 + pick(8) }, () => letters[pick(letters.length)]).join('');
  return `${' '.repeat(pick(3))}${word}${' '.repeat(pick(3))}`;
}

// The title, brief, and starter file for this quest are in quests/text.
export default {
  id: 'string-shout',
  rung: 1,
  complexity: 1,

  async check(mod) {
    if (typeof mod.shout !== 'function') return missingExport('shout', typeof mod.shout);
    const cases = [...FIXED];
    for (let i = 0; i < 20; i++) {
      const input = randomText();
      cases.push([input, `${input.trim().toUpperCase()}!`]);
    }
    for (const [input, wanted] of cases) {
      const gave = mod.shout(input);
      if (gave !== wanted) {
        return wrongResult(`shout(${JSON.stringify(input)})`, JSON.stringify(wanted), JSON.stringify(gave));
      }
    }
    return passed('check.pass.loud');
  },
};
