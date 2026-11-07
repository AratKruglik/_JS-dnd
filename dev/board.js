import { execFileSync } from 'node:child_process';

export const makeRunner = (timeoutMs, env = process.env) => (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', timeout: timeoutMs, env, stdio: ['ignore', 'pipe', 'pipe'] });

const defaultRun = makeRunner(10_000);

export function fetchBoard({ owner, number }, run = defaultRun) {
  try {
    const stdout = run('gh', [
      'project', 'item-list', String(number),
      '--owner', owner,
      '--format', 'json',
      '--limit', '100',
    ]);
    const { items } = JSON.parse(stdout);
    return {
      ok: true,
      items: items
        .filter((item) => item.content?.number != null)
        .map((item) => ({
          number: item.content.number,
          title: item.title ?? item.content.title,
          status: item.status ?? 'No status',
        })),
    };
  } catch (error) {
    return { ok: false, reason: String(error?.message ?? error).split('\n')[0] };
  }
}
