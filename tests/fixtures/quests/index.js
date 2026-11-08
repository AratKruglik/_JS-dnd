// Test-only quest registry: one tiny quest called "echo" that expects answer() to return 42.
export const QUESTS = [
  {
    id: 'echo',
    title: 'Echo',
    rung: 1,
    complexity: 1,
    file: 'player/echo.js',
    brief: 'Export a function answer() that returns 42.',
    stub: 'export function answer() {\n  // your code here\n}\n',
    async check(mod) {
      const got = await mod.answer();
      return { pass: got === 42, expected: '42', got: String(got) };
    },
  },
];

export const getQuest = (id) => QUESTS.find((q) => q.id === id);
