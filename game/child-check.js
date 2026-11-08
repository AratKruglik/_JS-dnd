import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const STATUSES = ['pass', 'fail', 'error', 'timeout'];
const MAX_TEXT = 300;

export const failure = (status, message) => ({ status, expected: '', got: '', message });
export const clip = (text) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 3)}...` : text);
export const oneLine = (text) => clip(String(text).split('\n')[0].trim());

// Runs a check script in a child process and reads back exactly one result line that starts
// with a random token. Synchronous and never throws: a bad player file only ever produces a
// status. Shared by quest checks and combat move checks. The token reaches the child as the
// first stdin line, not in argv, so the player's code has no copy of it to print.
export function runChecked({ entry, args = [], input = '', timeoutMs }) {
  const token = `QUEST_RESULT_${randomUUID()}`;
  const run = spawnSync(process.execPath, [entry, ...args], {
    encoding: 'utf8',
    input: `${token}\n${input}`,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
  });

  if (run.error?.code === 'ETIMEDOUT') {
    return failure('timeout', `Your code ran longer than ${timeoutMs / 1000} seconds and was stopped.`);
  }
  if (run.error?.code === 'ENOBUFS') return failure('error', 'Your code printed too much output.');
  if (run.error) return failure('error', oneLine(run.error.message));

  const line = run.stdout
    .split('\n')
    .reverse()
    .find((l) => l.startsWith(`${token} `));
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
