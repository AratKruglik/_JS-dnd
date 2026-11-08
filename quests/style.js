// The code style directions shown with every quest. The checks (Prettier and ESLint, see
// game/style-check.js) cover the mechanical ones; the Master reads for the rest.
export const GENERAL_STYLE = [
  'Use const by default, let only when a variable is reassigned, and never var.',
  'Use strict equality (===), never ==.',
  'Use clear camelCase names. A name says what the value is, not its type.',
  'Write small functions that do one job. Return values, do not print them.',
  'Do not change the arguments you receive unless the spec says so.',
  'Leave no console.log in the submitted file.',
  'Use a two space indent, single quotes, and semicolons.',
  'Write comments only for the why, never for the what.',
  'Solve the real problem. Never hardcode expected results, read the check files, or use eval.',
];
