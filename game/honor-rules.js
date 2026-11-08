import { addHonorEvent } from './honor.js';

// Default honor deltas per kind of event. The spec names the behaviors but not the numbers,
// so these are placeholders the owner can tune in this one table.
export const HONOR_RULES = {
  clean_solve: 5,
  clean_solve_no_hints: 8,
  cheat: -15,
  illegal_link: -2,
  master_leak: -2,
  swearing: -2,
  insult_npc: -3,
  deviant: -5,
  vandalism: -3,
  kill_unprovoked: -15,
  kill_self_defense: 0,
  kindness: 2,
  help_attempt: 5,
  help_success: 8,
  greeting: 1,
};

// Below 0 the Master roasts, at 0 and above the review is gentle.
export const toneFor = (honor) => (honor < 0 ? 'roast' : 'gentle');

export function applyHonorRule(db, saveId, kind, note) {
  if (!Object.hasOwn(HONOR_RULES, kind)) {
    throw new Error(`Unknown honor kind "${kind}". Known kinds: ${Object.keys(HONOR_RULES).join(', ')}.`);
  }
  return addHonorEvent(db, saveId, { delta: HONOR_RULES[kind], kind, reason: note ?? kind });
}
