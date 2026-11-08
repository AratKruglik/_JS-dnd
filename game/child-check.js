import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { t } from './i18n.js';

const STATUSES = ['pass', 'fail', 'error', 'timeout'];
const MAX_TEXT = 300;

export const clip = (text) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 3)}...` : text);
export const oneLine = (text) => clip(String(text).split('\n')[0].trim());

// A part is { key, params } (rendered in the language) or a plain string (passed through as it is).
const render = (part, lang) => {
  if (part === undefined || part === null || part === '') return '';
  return typeof part === 'string' ? part : t(lang, part.key, part.params ?? {});
};

export const failure = (status, key, params = {}, lang = 'en') => ({
  status,
  expected: '',
  got: '',
  message: t(lang, key, params),
});

// Runs a check script in a child process and reads back exactly one result line that starts
// with a random token. Synchronous and never throws: a bad player file only ever produces a
// status. Shared by quest checks and combat move checks. The token reaches the child as the
// first stdin line, not in argv, so the player's code has no copy of it to print. The child's
// message parts are rendered here, in the language of the save.
export function runChecked({ entry, args = [], input = '', timeoutMs, lang = 'en' }) {
  const token = `QUEST_RESULT_${randomUUID()}`;
  const run = spawnSync(process.execPath, [entry, ...args], {
    encoding: 'utf8',
    input: `${token}\n${input}`,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
  });

  if (run.error?.code === 'ETIMEDOUT') {
    return failure('timeout', 'check.timeout.message', { seconds: timeoutMs / 1000 }, lang);
  }
  if (run.error?.code === 'ENOBUFS') return failure('error', 'check.tooMuchOutput.message', {}, lang);
  if (run.error) return failure('error', 'check.raw.message', { message: oneLine(run.error.message) }, lang);

  const line = run.stdout
    .split('\n')
    .reverse()
    .find((l) => l.startsWith(`${token} `));
  if (!line) return failure('error', 'check.noResult.message', {}, lang);

  try {
    const parsed = JSON.parse(line.slice(token.length + 1));
    if (!STATUSES.includes(parsed.status)) throw new Error('bad status');
    return {
      status: parsed.status,
      expected: clip(String(render(parsed.expected, lang))),
      got: clip(String(render(parsed.got, lang))),
      message: oneLine(render(parsed.message, lang)),
    };
  } catch {
    return failure('error', 'check.unreadable.message', {}, lang);
  }
}
