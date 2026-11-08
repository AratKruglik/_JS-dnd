// The fixed shape of every world (spec 5.2): same number of locations, NPCs, and quests for
// every player. The Master only invents names, descriptions, and voices for these slots.
// Roles are setting-neutral on purpose: a "market" becomes a night bazaar, a scrap bazaar, a
// goblin fair. Every location has 4 exits or fewer because choice prompts take at most 4 options.
export const SKELETON = {
  start: 'L1',
  locations: [
    { slot: 'L1', role: 'starting hub', exits: ['L2', 'L3', 'L4'] },
    { slot: 'L2', role: 'market', exits: ['L1', 'L5'] },
    { slot: 'L3', role: 'outskirts', exits: ['L1', 'L6'] },
    { slot: 'L4', role: 'ruin', exits: ['L1', 'L5'] },
    { slot: 'L5', role: 'archive', exits: ['L2', 'L4', 'L6'] },
    { slot: 'L6', role: 'stronghold', exits: ['L3', 'L5'] },
  ],
  // NPCs holding a quest hand them out in registry order (quests/index.js). The rest are
  // flavor and hint givers.
  npcs: [
    { slot: 'N1', location: 'L1', role: 'mentor', questId: 'dice-roll' },
    { slot: 'N2', location: 'L2', role: 'trader', questId: 'string-shout' },
    { slot: 'N3', location: 'L5', role: 'keeper', questId: 'array-sum' },
    { slot: 'N4', location: 'L3', role: 'wanderer' },
    { slot: 'N5', location: 'L4', role: 'recluse' },
    { slot: 'N6', location: 'L6', role: 'captain' },
  ],
};
