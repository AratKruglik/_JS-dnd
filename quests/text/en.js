// English quest text: titles, briefs, starter files, and the style directions. Check messages live in
// game/locales/en.js. The code in a starter file must match the Ukrainian one line for line, only the
// comments differ. No em-dash or en-dash anywhere.
export default {
  general: [
    'Use const by default, let only when a variable is reassigned, and never var.',
    'Use strict equality (===), never ==.',
    'Use clear camelCase names. A name says what the value is, not its type.',
    'Write small functions that do one job. Return values, do not print them.',
    'Do not change the arguments you receive unless the spec says so.',
    'Leave no console.log in the submitted file.',
    'Use a two space indent, single quotes, and semicolons.',
    'Write comments only for the why, never for the what.',
    'Solve the real problem. Never hardcode expected results, read the check files, or use eval.',
  ],
  quests: {
    'dice-roll': {
      title: 'Roll your own die',
      brief:
        'Write a function rollDie(sides, rng) that rolls one die. rng is a function that gives a number from 0 up to, but not including, 1 (it defaults to Math.random). Return a whole number from 1 to sides. Read game/dice.js first to see how the game does it, then write your own version.',
      stub: `// Quest: roll your own die.
// Export rollDie(sides, rng). rng() gives a number from 0 up to (not including) 1.
// Return a whole number from 1 to sides. Read game/dice.js for inspiration, but write your own.
export function rollDie(sides, rng = Math.random) {
  // your code here
}
`,
      specific: [],
    },
    'string-shout': {
      title: 'Make some noise',
      brief:
        'Write a function shout(text). It removes spaces from both ends of the text, makes it all capital letters, and puts an exclamation mark on the end.',
      stub: `// Quest: make some noise.
// Export shout(text): trim the spaces off both ends, make it ALL CAPS, and add a "!" at the end.
export function shout(text) {
  // your code here
}
`,
      specific: [],
    },
    'array-sum': {
      title: 'Count the even ones',
      brief:
        'Write a function sumEven(numbers). It receives an array of whole numbers and returns the total of only the even ones. An empty array gives 0.',
      stub: `// Quest: count the even ones.
// Export sumEven(numbers): add up only the even numbers in the array and return the total.
// An empty array, or one with no even numbers, gives 0.
export function sumEven(numbers) {
  // your code here
}
`,
      specific: [],
    },
  },
};
