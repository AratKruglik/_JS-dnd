import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKELETON } from '../../world/skeleton.js';
import { QUESTS } from '../../quests/index.js';

const bySlot = Object.fromEntries(SKELETON.locations.map((l) => [l.slot, l]));

test('six locations and seven npcs with unique slots, and the start is L1', () => {
  assert.equal(SKELETON.locations.length, 6);
  assert.equal(SKELETON.npcs.length, 7);
  assert.equal(new Set(SKELETON.locations.map((l) => l.slot)).size, 6);
  assert.equal(new Set(SKELETON.npcs.map((n) => n.slot)).size, 7);
  assert.equal(SKELETON.start, 'L1');
  assert.ok(bySlot.L1);
});

test('the map is connected and exits are symmetric', () => {
  for (const location of SKELETON.locations) {
    for (const exit of location.exits) {
      assert.ok(bySlot[exit], `${location.slot} exits to unknown ${exit}`);
      assert.ok(bySlot[exit].exits.includes(location.slot), `${exit} does not lead back to ${location.slot}`);
      assert.notEqual(exit, location.slot);
    }
  }
  const seen = new Set([SKELETON.start]);
  const queue = [SKELETON.start];
  while (queue.length) {
    for (const next of bySlot[queue.shift()].exits) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  assert.equal(seen.size, SKELETON.locations.length);
});

test('no location has more than 4 exits (choice prompts take 2 to 4 options)', () => {
  for (const location of SKELETON.locations) {
    assert.ok(
      location.exits.length >= 1 && location.exits.length <= 4,
      `${location.slot} has ${location.exits.length} exits`,
    );
  }
});

test('every npc stands in a real location and quest holders follow the registry order', () => {
  for (const npc of SKELETON.npcs) assert.ok(bySlot[npc.location], `${npc.slot} is in unknown ${npc.location}`);
  const holders = SKELETON.npcs.filter((n) => n.questId).map((n) => n.questId);
  assert.deepEqual(
    holders,
    QUESTS.map((q) => q.id),
  );
  for (const id of holders) assert.ok(QUESTS.some((q) => q.id === id));
});

test('N7 is the final boss at the stronghold, holds no quest, and shares L6 with the captain', () => {
  const boss = SKELETON.npcs.find((n) => n.slot === 'N7');
  assert.deepEqual(boss, { slot: 'N7', location: 'L6', role: 'boss' });
  assert.deepEqual(
    SKELETON.npcs.filter((n) => n.location === 'L6').map((n) => n.slot),
    ['N6', 'N7'],
  );
});
