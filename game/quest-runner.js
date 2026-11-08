import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { failure, runChecked } from './child-check.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const childEntry = resolve(repoRoot, 'quests', 'run-check.js');

// Step 1 of a quest: run the player's file against the quest's fixed check in a child process.
// Synchronous and never throws; a bad file only ever produces a status.
export function runQuestCheck(questId, playerPath, { timeoutMs = 5000, questsModule, lang = 'en' } = {}) {
  if (!existsSync(playerPath)) return failure('error', 'check.fileNotFound.message', { path: playerPath }, lang);
  return runChecked({
    entry: childEntry,
    timeoutMs,
    lang,
    args: questsModule ? [questId, playerPath, questsModule] : [questId, playerPath],
  });
}
