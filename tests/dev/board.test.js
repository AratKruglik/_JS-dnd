import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchBoard, makeRunner } from '../../dev/board.js';

function envWithFakeGh(script) {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-fakegh-'));
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\n${script}\n`);
  chmodSync(join(dir, 'gh'), 0o755);
  return { ...process.env, PATH: `${dir}:${process.env.PATH}` };
}

const cfg = { owner: 'yamnyk', number: 3 };

test('the default runner times out a hanging gh and reports it quickly', () => {
  const started = Date.now();
  const result = fetchBoard(cfg, makeRunner(300, envWithFakeGh('sleep 5')));
  assert.equal(result.ok, false);
  assert.ok(Date.now() - started < 3000, 'must not wait for the hanging process');
});

test('the default runner reports a failing gh as ok false', () => {
  const result = fetchBoard(cfg, makeRunner(5000, envWithFakeGh('echo "not logged in" >&2; exit 4')));
  assert.equal(result.ok, false);
  assert.ok(result.reason.length > 0);
});

test('the default runner reports a missing gh as ok false', () => {
  const emptyDir = mkdtempSync(join(tmpdir(), 'jsdnd-nogh-'));
  const result = fetchBoard(cfg, makeRunner(5000, { PATH: emptyDir }));
  assert.equal(result.ok, false);
});

const fixture = readFileSync(new URL('../fixtures/item-list.json', import.meta.url), 'utf8');

test('fetchBoard returns ok false when the runner throws', () => {
  const run = () => {
    throw new Error('spawn gh ENOENT');
  };
  const result = fetchBoard({ owner: 'yamnyk', number: 3 }, run);
  assert.equal(result.ok, false);
  assert.match(result.reason, /spawn gh ENOENT/);
});

test('fetchBoard maps the fixture to BoardItem[]', () => {
  let seen;
  const run = (cmd, args) => {
    seen = { cmd, args };
    return fixture;
  };
  const result = fetchBoard({ owner: 'yamnyk', number: 3 }, run);
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items[0], {
    number: 1,
    title: 'Plan 2: Game DB and script layer',
    status: 'Todo',
  });
  assert.equal(seen.cmd, 'gh');
  assert.deepEqual(seen.args.slice(0, 5), ['project', 'item-list', '3', '--owner', 'yamnyk']);
});
