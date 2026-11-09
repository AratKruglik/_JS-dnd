import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSave, createHeroFromChoices } from '../../game/hero.js';
import { setSetting, fillWorld, go } from '../../game/world.js';
import { beginFight, heroAttack, fleeFight } from '../../game/combat-engine.js';
import { checkQuest, judgeQuest, revokeSolve } from '../../game/quests.js';
import { setLanguage } from '../../game/i18n.js';
import { GOLD_PER_COMPLEXITY, readVitals, restHero, addGold } from '../../game/vitals.js';
import { listItems, countItems, nameItem, MAX_ITEM_NAME } from '../../game/inventory.js';
import { freshDb } from './helpers.js';
import { SETTING, goodWorld } from './world-fixtures.js';

const solutions = join(resolve(dirname(fileURLToPath(import.meta.url))), '..', 'quests', 'solutions');
const script = (...pairs) => {
  let i = 0;
  return () => {
    const [value, sides] = pairs[i++];
    return (value - 0.5) / sides;
  };
};

function ready() {
  const db = freshDb();
  const saveId = createSave(db, {});
  createHeroFromChoices(db, saveId, {
    name: 'Bilbo',
    race: 'hobbit',
    heroClass: 'fighter',
    scores: [8, 15, 14, 8, 8, 15],
  });
  setSetting(db, saveId, SETTING);
  fillWorld(db, saveId, goodWorld());
  const playerDir = mkdtempSync(join(tmpdir(), 'jsdnd-inv-'));
  const solve = (id, verdict = 'clean') => {
    copyFileSync(join(solutions, `${id}.reference.js`), join(playerDir, `${id}.js`));
    assert.equal(checkQuest(db, saveId, id, { playerDir, timeoutMs: 15000 }).status, 'pass');
    return judgeQuest(db, saveId, id, verdict, verdict === 'clean' ? null : 'hardcoded', { playerDir });
  };
  return { db, saveId, solve, playerDir };
}

// The hero hits for 8 and the weak enemy (6 HP) falls.
function winFight(db, saveId) {
  beginFight(db, saveId, {
    npcSlot: 'N1',
    tier: 'weak',
    aggressor: 'hero',
    rng: script([15, 20], [10, 20]),
  });
  return heroAttack(db, saveId, { rng: script([15, 20], [5, 8]) });
}

test('a clean solve pays 5 gold per point of complexity and gives one unnamed item', () => {
  const { db, saveId, solve } = ready();
  assert.equal(GOLD_PER_COMPLEXITY, 5);
  solve('dice-roll');
  assert.equal(readVitals(db, saveId).gold, 10);
  assert.deepEqual(
    listItems(db, saveId).map(({ id, name, source, questId, fightId }) => ({ id, name, source, questId, fightId })),
    [{ id: 1, name: null, source: 'quest', questId: 'dice-roll', fightId: null }],
  );
  assert.equal(countItems(db, saveId), 1);
  solve('string-shout');
  assert.equal(readVitals(db, saveId).gold, 15);
  assert.equal(countItems(db, saveId), 2);
});

test('a cheated verdict pays nothing and gives nothing', () => {
  const { db, saveId, solve } = ready();
  solve('dice-roll', 'cheated');
  assert.equal(readVitals(db, saveId).gold, 0);
  assert.equal(countItems(db, saveId), 0);
});

test('a won fight gives one item and no gold, and a fled fight gives nothing', () => {
  const { db, saveId } = ready();
  const won = winFight(db, saveId);
  assert.equal(won.status, 'won');
  assert.equal(readVitals(db, saveId).gold, 0);
  const [item] = listItems(db, saveId);
  assert.deepEqual([item.source, item.fightId, item.questId, item.name], ['fight', won.fightId, null, null]);

  go(db, saveId, 'L3');
  beginFight(db, saveId, { npcSlot: 'N4', tier: 'weak', aggressor: 'hero', rng: script([15, 20], [10, 20]) });
  fleeFight(db, saveId);
  assert.equal(countItems(db, saveId), 1);
});

test('revoking a solve takes back its gold and its item, and solving again pays again', () => {
  const { db, saveId, solve } = ready();
  solve('dice-roll');
  solve('string-shout');
  revokeSolve(db, saveId, 'string-shout', 'found a hardcoded answer');
  assert.equal(readVitals(db, saveId).gold, 10);
  assert.deepEqual(
    listItems(db, saveId).map((i) => i.questId),
    ['dice-roll'],
  );
  assert.equal(countItems(db, saveId), 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory_items').get().n, 2, 'the row stays as history');
  solve('string-shout');
  assert.equal(readVitals(db, saveId).gold, 15);
  assert.equal(countItems(db, saveId), 2);
});

test('gold already spent is not taken back below zero', () => {
  const { db, saveId, solve } = ready();
  solve('dice-roll');
  db.prepare('UPDATE heroes SET hp = 3 WHERE save_id = ?').run(saveId);
  assert.equal(restHero(db, saveId).gold, 5);
  revokeSolve(db, saveId, 'dice-roll');
  assert.equal(readVitals(db, saveId).gold, 0);
});

test('revoking a solve that gave no item leaves other items alone', () => {
  const { db, saveId, solve } = ready();
  winFight(db, saveId);
  solve('dice-roll');
  revokeSolve(db, saveId, 'dice-roll');
  assert.deepEqual(
    listItems(db, saveId).map((i) => i.source),
    ['fight'],
  );
});

test('the Master names an item once, with a trimmed name of a sensible length', () => {
  const { db, saveId, solve } = ready();
  solve('dice-roll');
  assert.equal(MAX_ITEM_NAME, 60);
  assert.deepEqual(nameItem(db, saveId, 1, '  Rusty Lucky Die  '), { id: 1, name: 'Rusty Lucky Die' });
  assert.equal(listItems(db, saveId)[0].name, 'Rusty Lucky Die');
  assert.throws(() => nameItem(db, saveId, 1, 'Another name'), /already has a name/i);
});

test('item names are checked: empty, too long, the wrong type, the wrong id, other saves, revoked items', () => {
  const { db, saveId, solve } = ready();
  solve('dice-roll');
  for (const bad of ['', '   ', 'x'.repeat(61), 'line\nbreak', undefined, 42, null])
    assert.throws(() => nameItem(db, saveId, 1, bad), /name/i, String(bad));
  assert.throws(() => nameItem(db, saveId, 99, 'Ghost'), /no item/i);
  assert.throws(() => nameItem(db, saveId, 1.5, 'Ghost'), /no item/i);
  const other = createSave(db, {});
  assert.throws(() => nameItem(db, other, 1, 'Stolen'), /no item/i);
  revokeSolve(db, saveId, 'dice-roll');
  assert.throws(() => nameItem(db, saveId, 1, 'Gone'), /no item/i);
});

test('item names follow the banned phrase list of the save language', () => {
  const { db, saveId, solve } = ready();
  solve('dice-roll');
  assert.throws(() => nameItem(db, saveId, 1, 'As an AI language model'), /banned phrase/i);
  setLanguage(db, saveId, 'uk');
  assert.throws(() => nameItem(db, saveId, 1, 'Меч, як штучний інтелект'), /banned phrase/i);
  assert.equal(nameItem(db, saveId, 1, 'Іржавий кубик').name, 'Іржавий кубик');
});

test('adding gold keeps working next to items', () => {
  const { db, saveId } = ready();
  assert.equal(addGold(db, saveId, 7), 7);
  assert.deepEqual(listItems(db, saveId), []);
});
