import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOW = 'Bash(node game/cli.js *)';

// A stand-in `claude` that prints a version for --version and records its arguments, one per line.
function stubClaude(version) {
  const bin = mkdtempSync(join(tmpdir(), 'jsdnd-playsh-'));
  const argvFile = join(bin, 'argv.txt');
  writeFileSync(
    join(bin, 'claude'),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${version}"; exit 0; fi\nprintf '%s\\n' "$@" > "${argvFile}"\n`,
  );
  chmodSync(join(bin, 'claude'), 0o755);
  return { bin, argv: () => readFileSync(argvFile, 'utf8').trimEnd().split('\n') };
}

const play = (bin, ...args) =>
  spawnSync('/bin/bash', [join(root, 'play.sh'), ...args], {
    env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
    encoding: 'utf8',
  });

test('play.sh starts claude with the prompt first, Sonnet, and the game commands pre-approved once', () => {
  const stub = stubClaude('2.1.311 (Claude Code)');
  const result = play(stub.bin);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(stub.argv(), ['/play', '--model', 'sonnet', '--allowedTools', ALLOW]);
});

test('extra arguments go after the options, and the allow flag still appears exactly once', () => {
  const stub = stubClaude('2.1.311 (Claude Code)');
  const result = play(stub.bin, '--continue');
  assert.equal(result.status, 0, result.stderr);
  const argv = stub.argv();
  assert.equal(argv[0], '/play');
  assert.equal(argv.at(-1), '--continue');
  assert.equal(argv.filter((arg) => arg === '--allowedTools').length, 1);
  assert.equal(argv.filter((arg) => arg === ALLOW).length, 1);
});

test('without claude installed play.sh stops with a clear message', () => {
  const empty = mkdtempSync(join(tmpdir(), 'jsdnd-playsh-none-'));
  const result = play(empty);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Claude Code is not installed/);
});

test('an older Claude Code gets one warning and the game still starts', () => {
  const stub = stubClaude('2.1.200 (Claude Code)');
  const result = play(stub.bin);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr.trim().split('\n').length, 1);
  assert.match(result.stderr, /2\.1\.200/);
  assert.match(result.stderr, /2\.1\.271/);
  assert.equal(stub.argv()[0], '/play');
});

test('the version check compares numbers, not text, and is quiet at and above the minimum', () => {
  const warns = (version) => play(stubClaude(`${version} (Claude Code)`).bin).stderr !== '';
  for (const version of ['2.1.271', '2.1.272', '2.1.1000', '2.10.0', '2.100.0', '3.0.0', '10.0.0'])
    assert.equal(warns(version), false, version);
  for (const version of ['2.1.270', '2.1.9', '2.0.999', '1.99.99', '0.0.1'])
    assert.equal(warns(version), true, version);
});

test('a version that cannot be read is not a reason to warn or to stop', () => {
  for (const output of ['not a version', '', 'v?']) {
    const stub = stubClaude(output);
    const result = play(stub.bin);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '', output);
    assert.equal(stub.argv()[0], '/play');
  }
});

test('play.sh is valid bash and executable', () => {
  assert.equal(spawnSync('/bin/bash', ['-n', join(root, 'play.sh')]).status, 0);
  assert.ok(statSync(join(root, 'play.sh')).mode & 0o111, 'play.sh must be executable');
});

test('the committed settings pre-approve nothing, and still wire both hooks and the status line', () => {
  const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf8'));
  assert.equal(settings.permissions, undefined);
  assert.ok(!JSON.stringify(settings).includes('cli.js *'));
  const commands = (event) => settings.hooks[event].flatMap((entry) => entry.hooks.map((hook) => hook.command));
  assert.ok(commands('UserPromptSubmit').some((command) => command.includes('game/play-hook.js')));
  const compact = settings.hooks.SessionStart.find((entry) => entry.matcher === 'compact');
  assert.ok(compact.hooks.some((hook) => hook.command.includes('game/play-hook.js')));
  assert.ok(commands('SessionStart').some((command) => command.includes('dev/session-start.js')));
  assert.match(settings.statusLine.command, /game\/statusline\.js/);
});

test('the skill still grants the game commands for its own turn only', () => {
  const skill = readFileSync(join(root, '.claude', 'skills', 'play', 'SKILL.md'), 'utf8');
  assert.match(skill, /^allowed-tools: Bash\(node game\/cli\.js \*\)$/m);
  assert.match(skill, /^disable-model-invocation: true$/m);
});
