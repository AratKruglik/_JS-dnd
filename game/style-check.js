import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { t } from './i18n.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PROBLEMS = 10;

const skipped = (lang, key) => ({ ran: false, ok: true, problems: [], message: t(lang, key) });

// What each of our lint rules says, in the player's language. The variable parts are read out of
// the linter's English message. English keeps the linter's own text, and a rule or message this table
// does not know (a parse error, say) keeps the linter's text in every language.
const RULE_PARAMS = {
  'no-var': () => ({}),
  'prefer-const': (message) => {
    const found = /^'(.+)' is never reassigned/.exec(message);
    return found ? { name: found[1] } : null;
  },
  eqeqeq: (message) => {
    const found = /^Expected '(.+)' and instead saw '(.+)'\.$/.exec(message);
    return found ? { expected: found[1], actual: found[2] } : null;
  },
  'no-console': () => ({}),
  'no-eval': () => ({}),
  'no-implied-eval': () => ({}),
  'no-new-func': () => ({}),
};

function lintMessage(m, lang) {
  if (lang === 'en') return m.message;
  const params = RULE_PARAMS[m.ruleId]?.(m.message);
  return params ? t(lang, `style.rule.${m.ruleId}`, params) : m.message;
}

// The style check for a player's file: ESLint rules plus the Prettier format, using this repo's
// own config. It only reports. Whether a style problem matters is decided by the quest flow.
export function checkStyle(file, { root = repoRoot, timeoutMs = 20000, lang = 'en' } = {}) {
  const prettier = join(root, 'node_modules', '.bin', 'prettier');
  const eslint = join(root, 'node_modules', '.bin', 'eslint');
  if (!existsSync(prettier) || !existsSync(eslint)) {
    return skipped(lang, 'style.notInstalled');
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
  if (lint.error || pretty.error) return skipped(lang, 'style.couldNotRun');

  const problems = [];
  try {
    const [report] = JSON.parse(lint.stdout);
    for (const m of report.messages) {
      problems.push({
        line: m.line ?? 0,
        text: `${t(lang, 'style.line', { line: m.line ?? 0, message: lintMessage(m, lang) })}${m.ruleId ? ` (${m.ruleId})` : ''}`,
      });
    }
  } catch {
    return skipped(lang, 'style.badLinterResult');
  }
  problems.sort((a, b) => a.line - b.line);
  const list = problems.map((p) => p.text);

  if (pretty.status === 0) {
    const wanted = pretty.stdout.replaceAll('\r\n', '\n').split('\n');
    const found = readFileSync(file, 'utf8').replaceAll('\r\n', '\n').split('\n');
    const at = wanted.findIndex((line, i) => line !== found[i]);
    if (at !== -1 || wanted.length !== found.length) {
      const i = at === -1 ? Math.min(wanted.length, found.length) : at;
      list.push(t(lang, 'style.formatting', { line: i + 1, text: wanted[i] ?? '' }));
    }
  }

  return { ran: true, ok: list.length === 0, problems: list.slice(0, MAX_PROBLEMS) };
}
