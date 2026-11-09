import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { sealDice } from '../game/integrity.js';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (env) => spawnSync('/bin/bash', [join(root, 'setup.sh')], { cwd: root, env, encoding: 'utf8' });

const gameEnv = () => ({
  ...process.env,
  JSDND_GAME_DB: join(mkdtempSync(join(tmpdir(), 'jsdnd-setup-')), 'data', 'game.db'),
});

test('setup.sh passes when node and node:sqlite work', () => {
  const result = run(gameEnv());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Setup complete/);
});

test('setup.sh creates the game DB', () => {
  const env = gameEnv();
  const result = run(env);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(env.JSDND_GAME_DB), 'game DB file should exist after setup');
  assert.match(result.stdout, /Setup complete/);
});

test('setup.sh fails with a clear message when node is missing', () => {
  const emptyDir = mkdtempSync(join(tmpdir(), 'jsdnd-nopath-'));
  const result = run({ PATH: `${emptyDir}:/bin:/usr/bin` });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node\.js/);
});

test('setup.sh explains a tampered dice file instead of blaming the folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-setup-tamper-'));
  const dicePath = join(dir, 'dice.js');
  const sealPath = join(dir, 'dice.sha256');
  copyFileSync(join(root, 'game', 'dice.js'), dicePath);
  sealDice(dicePath, sealPath);
  appendFileSync(dicePath, '\n// edited\n');
  const result = run({
    ...process.env,
    JSDND_DICE_PATH: dicePath,
    JSDND_DICE_SEAL: sealPath,
    JSDND_GAME_DB: join(dir, 'game.db'),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /dice/i);
});

const HELP = [/nvm install node/, /brew install node/, /nodejs\.org/];

test('a missing node prints how to install it for each common setup, and installs nothing', () => {
  const emptyDir = mkdtempSync(join(tmpdir(), 'jsdnd-nopath-'));
  const result = run({ PATH: `${emptyDir}:/bin:/usr/bin` });
  assert.equal(result.status, 1);
  for (const pattern of HELP) assert.match(result.stderr, pattern);
  assert.match(result.stderr, /run this script again/i);
});

test('an old node without node:sqlite names its version and prints the same install help', () => {
  const fakeBin = mkdtempSync(join(tmpdir(), 'jsdnd-oldnode-'));
  const fake = join(fakeBin, 'node');
  writeFileSync(fake, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo v18.0.0; exit 0; fi\nexit 1\n');
  chmodSync(fake, 0o755);
  const result = run({ PATH: `${fakeBin}:/bin:/usr/bin` });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /v18\.0\.0/);
  assert.match(result.stderr, /node:sqlite/);
  for (const pattern of HELP) assert.match(result.stderr, pattern);
});

// A throwaway copy of setup.sh next to a stub game, so the npm step can be seen without touching the repo.
function stubInstall() {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-npm-'));
  mkdirSync(join(dir, 'game'));
  copyFileSync(join(root, 'setup.sh'), join(dir, 'setup.sh'));
  // The stub game logs every command it is given, so a test can see what setup asked of it.
  writeFileSync(
    join(dir, 'game', 'cli.js'),
    [
      "import { appendFileSync } from 'node:fs';",
      "import { dirname, join } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      "appendFileSync(join(dirname(fileURLToPath(import.meta.url)), 'calls.log'), process.argv.slice(2).join(' ') + '\\n');",
      "console.log('{}');",
      '',
    ].join('\n'),
  );
  return dir;
}
const runIn = (dir, env) => spawnSync('/bin/bash', [join(dir, 'setup.sh')], { cwd: dir, env, encoding: 'utf8' });
const withNpm = (script) => {
  const bin = mkdtempSync(join(tmpdir(), 'jsdnd-fakebin-'));
  symlinkSync(process.execPath, join(bin, 'node'));
  if (script) {
    writeFileSync(join(bin, 'npm'), script);
    chmodSync(join(bin, 'npm'), 0o755);
  }
  return `${bin}:/bin:/usr/bin`;
};

test('setup.sh installs the style tools with npm when they are missing', () => {
  const dir = stubInstall();
  const result = runIn(dir, { PATH: withNpm(`#!/bin/sh\necho "$@" > "${dir}/npm-called"\nexit 0\n`) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Setup complete/);
  assert.ok(existsSync(join(dir, 'npm-called')), 'npm should have run');
});

test('setup.sh leaves npm alone when the style tools are already there', () => {
  const dir = stubInstall();
  mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', '.bin', 'prettier'), '');
  chmodSync(join(dir, 'node_modules', '.bin', 'prettier'), 0o755);
  const result = runIn(dir, { PATH: withNpm(`#!/bin/sh\ntouch "${dir}/npm-called"\n`) });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(dir, 'npm-called')), false);
});

test('a failing npm install only warns, and setup still completes', () => {
  const dir = stubInstall();
  const result = runIn(dir, { PATH: withNpm('#!/bin/sh\nexit 1\n') });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Setup complete/);
  assert.match(result.stderr, /style check will be skipped/i);
});

test('no npm at all only warns, and setup still completes', () => {
  const dir = stubInstall();
  const result = runIn(dir, { PATH: withNpm(null) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Setup complete/);
  assert.match(result.stderr, /npm/);
  assert.match(result.stderr, /style check will be skipped/i);
});

test('setup.sh names both sealed files when it tells a player what to restore', () => {
  const script = readFileSync(join(root, 'setup.sh'), 'utf8');
  assert.match(script, /game\/dice\.js and game\/rolls\.js/);
});

const calls = (dir) =>
  existsSync(join(dir, 'game', 'calls.log'))
    ? readFileSync(join(dir, 'game', 'calls.log'), 'utf8')
        .trim()
        .split('\n')
    : [];
const goodNpm = (dir) => `#!/bin/sh\necho "$@" > "${dir}/npm-called"\nexit 0\n`;

test('with no terminal setup speaks English and leaves the language for /play to ask', () => {
  const dir = stubInstall();
  const result = runIn(dir, { PATH: withNpm(goodNpm(dir)) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Setup complete/);
  assert.deepEqual(calls(dir), ['init']);
});

test('an answered Ukrainian language makes every message Ukrainian and saves the language after init', () => {
  const dir = stubInstall();
  const result = runIn(dir, { PATH: withNpm(goodNpm(dir)), JSDND_SETUP_LANG: 'uk' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Налаштування завершено/);
  assert.doesNotMatch(result.stdout, /Setup complete/);
  assert.deepEqual(calls(dir), ['init', 'lang set uk']);
});

test('an answered English language is saved too, and a bad answer is ignored', () => {
  const english = stubInstall();
  runIn(english, { PATH: withNpm(goodNpm(english)), JSDND_SETUP_LANG: 'en' });
  assert.deepEqual(calls(english), ['init', 'lang set en']);
  const bad = stubInstall();
  const result = runIn(bad, { PATH: withNpm(goodNpm(bad)), JSDND_SETUP_LANG: 'xx' });
  assert.match(result.stdout, /Setup complete/);
  assert.deepEqual(calls(bad), ['init']);
});

test('a missing node in Ukrainian prints Ukrainian text with the same commands', () => {
  const emptyDir = mkdtempSync(join(tmpdir(), 'jsdnd-nopath-'));
  const result = run({ PATH: `${emptyDir}:/bin:/usr/bin`, JSDND_SETUP_LANG: 'uk' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node\.js не знайдено/);
  for (const pattern of HELP) assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stderr, /is missing/);
});

test('a failing npm in Ukrainian only warns, in Ukrainian, and setup still completes', () => {
  const dir = stubInstall();
  const result = runIn(dir, { PATH: withNpm('#!/bin/sh\nexit 1\n'), JSDND_SETUP_LANG: 'uk' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /перевірку стилю буде пропущено/);
  assert.match(result.stdout, /Налаштування завершено/);
});

test('a Node without Ukrainian language data falls back to English and does not save Ukrainian', () => {
  const dir = stubInstall();
  const bin = mkdtempSync(join(tmpdir(), 'jsdnd-noicu-'));
  writeFileSync(
    join(bin, 'node'),
    `#!/bin/sh\ncase "$*" in\n  *supportedLocalesOf*) exit 1 ;;\nesac\nexec "${process.execPath}" "$@"\n`,
  );
  chmodSync(join(bin, 'node'), 0o755);
  writeFileSync(join(bin, 'npm'), goodNpm(dir));
  chmodSync(join(bin, 'npm'), 0o755);
  const result = runIn(dir, { PATH: `${bin}:/bin:/usr/bin`, JSDND_SETUP_LANG: 'uk' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /no Ukrainian language data/);
  assert.match(result.stdout, /Setup complete/);
  assert.deepEqual(calls(dir), ['init']);
});

// The messages are in one table of "language:key" lines, so a pair is easy to check.
function messages() {
  const text = readFileSync(join(root, 'setup.sh'), 'utf8');
  const out = { en: {}, uk: {} };
  const pattern = /^ {4}(en|uk):(\w+)\)([\s\S]*?);;$/gm;
  for (const match of text.matchAll(pattern)) out[match[1]][match[2]] = match[3];
  return out;
}

// What must be identical in both languages: commands, files, folders, and links.
const codeTokens = (text) =>
  [
    ...text.matchAll(
      /https?:\/\/[^\s"']+|(?:brew|nvm|npm) install(?: node)?|node:sqlite|game\/[\w.]+|data\/|\$\{?\w+\}?|\$\(node --version\)/g,
    ),
  ]
    .map((m) => m[0].trim())
    .sort();

test('every setup message exists in English and Ukrainian, with the same commands, files, and links', () => {
  const { en, uk } = messages();
  assert.ok(Object.keys(en).length >= 8, 'the message table was not found');
  assert.deepEqual(Object.keys(uk).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en)) {
    assert.deepEqual(codeTokens(uk[key]), codeTokens(en[key]), key);
    assert.match(uk[key], /\p{Script=Cyrillic}/u, `${key} has no Ukrainian`);
  }
});

test('the Ukrainian setup messages have no long dash', () => {
  const dashes = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];
  const text = readFileSync(join(root, 'setup.sh'), 'utf8');
  for (const dash of dashes) assert.ok(!text.includes(dash));
});

// The prompt is shown on a terminal. Node cannot give a child a real terminal without extra tools, so
// JSDND_SETUP_PROMPT=1 makes the script ask and read the answer from stdin, as it would on a terminal.
test('the language question is asked once and the answer is used', () => {
  for (const [answer, shown, saved] of [
    ['2\n', /Налаштування завершено/, 'lang set uk'],
    ['uk\n', /Налаштування завершено/, 'lang set uk'],
    ['1\n', /Setup complete/, 'lang set en'],
    ['\n', /Setup complete/, 'lang set en'],
    ['nonsense\n', /Setup complete/, 'lang set en'],
  ]) {
    const dir = stubInstall();
    const result = spawnSync('/bin/bash', [join(dir, 'setup.sh')], {
      cwd: dir,
      env: { PATH: withNpm(goodNpm(dir)), JSDND_SETUP_PROMPT: '1' },
      input: answer,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Language \/ Мова/);
    assert.match(result.stdout, shown, JSON.stringify(answer));
    assert.deepEqual(calls(dir), ['init', saved], JSON.stringify(answer));
  }
});

test('the question is shown only once, and an answered language skips it', () => {
  const dir = stubInstall();
  const result = spawnSync('/bin/bash', [join(dir, 'setup.sh')], {
    cwd: dir,
    env: { PATH: withNpm(goodNpm(dir)), JSDND_SETUP_PROMPT: '1', JSDND_SETUP_LANG: 'uk' },
    input: '1\n',
    encoding: 'utf8',
  });
  assert.doesNotMatch(result.stdout, /Language \/ Мова/);
  assert.deepEqual(calls(dir), ['init', 'lang set uk']);
});
