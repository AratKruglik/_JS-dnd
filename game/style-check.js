import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PROBLEMS = 10;

const skipped = (message) => ({ ran: false, ok: true, problems: [], message });

// The style check for a player's file: ESLint rules plus the Prettier format, using this repo's
// own config. It only reports. Whether a style problem matters is decided by the quest flow.
export function checkStyle(file, { root = repoRoot, timeoutMs = 20000 } = {}) {
  const prettier = join(root, 'node_modules', '.bin', 'prettier');
  const eslint = join(root, 'node_modules', '.bin', 'eslint');
  if (!existsSync(prettier) || !existsSync(eslint)) {
    return skipped('Style tools are not installed. Run npm install in the game folder.');
  }

  // Run next to the file so ESLint treats it as inside its base path, wherever the player folder is.
  const options = { cwd: dirname(file), encoding: 'utf8', timeout: timeoutMs };
  const name = basename(file);
  const lint = spawnSync(
    eslint,
    ['--config', join(root, 'eslint.player.config.js'), '--format', 'json', name],
    options,
  );
  const pretty = spawnSync(
    prettier,
    ['--config', join(root, '.prettierrc.json'), '--ignore-path', devNull, name],
    options,
  );
  if (lint.error || pretty.error) return skipped('The style check could not run.');

  const problems = [];
  try {
    const [report] = JSON.parse(lint.stdout);
    for (const m of report.messages) {
      problems.push({
        line: m.line ?? 0,
        text: `line ${m.line ?? 0}: ${m.message}${m.ruleId ? ` (${m.ruleId})` : ''}`,
      });
    }
  } catch {
    return skipped('The style check could not read the linter result.');
  }
  problems.sort((a, b) => a.line - b.line);
  const list = problems.map((p) => p.text);

  if (pretty.status === 0) {
    const wanted = pretty.stdout.replaceAll('\r\n', '\n').split('\n');
    const found = readFileSync(file, 'utf8').replaceAll('\r\n', '\n').split('\n');
    const at = wanted.findIndex((line, i) => line !== found[i]);
    if (at !== -1 || wanted.length !== found.length) {
      const i = at === -1 ? Math.min(wanted.length, found.length) : at;
      list.push(`formatting: line ${i + 1} should read "${wanted[i] ?? ''}"`);
    }
  }

  return { ran: true, ok: list.length === 0, problems: list.slice(0, MAX_PROBLEMS) };
}
