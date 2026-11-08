import diceRoll from './dice-roll.js';
import stringShout from './string-shout.js';
import arraySum from './array-sum.js';

// The fixed quest list, in play order. Checks live in the repo; the Master only reskins the story.
export const QUESTS = [diceRoll, stringShout, arraySum];

export const getQuest = (id) => QUESTS.find((quest) => quest.id === id);
