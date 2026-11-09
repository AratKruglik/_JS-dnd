import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGameDb } from '../../game/db.js';
import { createSave, createHeroFromChoices } from '../../game/hero.js';
import { setSetting, fillWorld } from '../../game/world.js';
import { SETTING, goodWorld } from './world-fixtures.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HERO = { name: 'Bilbo', race: 'hobbit', heroClass: 'fighter', scores: [8, 15, 14, 8, 8, 15] };

// A throwaway copy of the game with a finished save and a /play session already marked, so the real
// dice.js and rolls.js are never touched. The hook runs from the copy, so a deleted or broken file there
// is a deleted or broken file for real.
function copyOfTheGame() {
  const dir = mkdtempSync(join(tmpdir(), 'jsdnd-hook-tamper-'));
  for (const part of ['game', 'quests', 'world', 'package.json'])
    cpSync(join(root, part), join(dir, part), { recursive: true });
  const env = { ...process.env, JSDND_GAME_DB: join(dir, 'data', 'game.db') };
  for (const name of ['JSDND_DICE_PATH', 'JSDND_ROLLS_PATH', 'JSDND_DICE_SEAL']) delete env[name];
  const db = openGameDb(env.JSDND_GAME_DB);
  const saveId = createSave(db, { name: 'Save 1' });
  createHeroFromChoices(db, saveId, HERO);
  setSetting(db, saveId, SETTING);
  fillWorld(db, saveId, goodWorld());
  db.prepare('INSERT INTO play_sessions (session_id, started_at) VALUES (?, ?)').run('game', new Date().toISOString());
  db.close();
  const hook = (payload) =>
    spawnSync('node', [join(dir, 'game', 'play-hook.js')], {
      cwd: dir,
      env,
      encoding: 'utf8',
      input: JSON.stringify(payload),
    });
  return { dir, hook };
}

const prompt = { session_id: 'game', hook_event_name: 'UserPromptSubmit', prompt: 'I look around' };
const compact = { session_id: 'game', hook_event_name: 'SessionStart', source: 'compact' };

for (const [name, damage] of [
  ['a deleted dice.js', (dir) => rmSync(join(dir, 'game', 'dice.js'))],
  ['a deleted rolls.js', (dir) => rmSync(join(dir, 'game', 'rolls.js'))],
  ['a dice.js with a syntax error', (dir) => appendFileSync(join(dir, 'game', 'dice.js'), '\nexport const = ;\n')],
  ['a rolls.js with a syntax error', (dir) => appendFileSync(join(dir, 'game', 'rolls.js'), '\nexport const = ;\n')],
]) {
  test(`the hook survives ${name}: exit 0, nothing on stderr, and the state still comes through`, () => {
    const { dir, hook } = copyOfTheGame();
    damage(dir);
    const line = hook(prompt);
    assert.equal(line.status, 0, line.stderr);
    assert.equal(line.stderr, '');
    assert.match(line.stdout, /^\[game\] at /);
    const after = hook(compact);
    assert.equal(after.status, 0, after.stderr);
    assert.equal(after.stderr, '');
    assert.match(after.stdout, /Game state after compaction: \{/);
  });
}

// The static import graph of a module: every file it can reach through relative imports.
function reach(entry) {
  const seen = new Set();
  const stack = [resolve(root, entry)];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:from|import)\s*\(?\s*'(\.[^']+)'/g)) {
      const target = normalize(join(dirname(file), match[1]));
      if (existsSync(target)) stack.push(target);
    }
  }
  return [...seen].map((file) => file.slice(root.length + 1));
}

test('the hook, the resume state, the fight reads, and the status line reach no sealed file', () => {
  for (const entry of ['game/fight-state.js', 'game/resume.js', 'game/play-hook.js', 'game/statusline.js']) {
    assert.ok(existsSync(join(root, entry)), `${entry} is missing`);
    const sealed = reach(entry).filter((file) => file === 'game/dice.js' || file === 'game/rolls.js');
    assert.deepEqual(sealed, [], `${entry} reaches ${sealed.join(', ')}`);
  }
});
