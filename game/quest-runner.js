import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const childEntry = resolve(repoRoot, 'quests', 'run-check.js');
const STATUSES = ['pass', 'fail', 'error', 'timeout'];

const failure = (status, message) => ({ status, expected: '', got: '', message });
const MAX_TEXT = 300;
const clip = (text) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 3)}...` : text);
const oneLine = (text) => clip(String(text).split('\n')[0].trim());

// Step 1 of a quest: run the player's file against the quest's fixed check in a child process.
// Synchronous and never throws; a bad file only ever produces a status.
export function runQuestCheck(questId, playerPath, { timeoutMs = 5000, questsModule } = {}) {
  if (!existsSync(playerPath)) return failure('error', `Player file not found: ${playerPath}`);

  const token = `QUEST_RESULT_${randomUUID()}`;
  const args = [childEntry, questId, playerPath, token];
  if (questsModule) args.push(questsModule);

  const run = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
  });

  if (run.error?.code === 'ETIMEDOUT') {
    return failure('timeout', `Your code ran longer than ${timeoutMs / 1000} seconds and was stopped.`);
  }
  if (run.error?.code === 'ENOBUFS') return failure('error', 'Your code printed too much output.');
  if (run.error) return failure('error', oneLine(run.error.message));

  const line = run.stdout.split('\n').reverse().find((l) => l.startsWith(`${token} `));
  if (!line) return failure('error', 'Your code stopped the program before the check could finish.');

  try {
    const parsed = JSON.parse(line.slice(token.length + 1));
    if (!STATUSES.includes(parsed.status)) throw new Error('bad status');
    return {
      status: parsed.status,
      expected: clip(String(parsed.expected ?? '')),
      got: clip(String(parsed.got ?? '')),
      message: oneLine(parsed.message ?? ''),
    };
  } catch {
    return failure('error', 'The check produced an unreadable result.');
  }
}
