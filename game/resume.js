import { getHero } from './hero.js';
import { getHonor } from './honor.js';
import { worldStatus, getSetting, look } from './world.js';
import { getProgress } from './quests.js';
import { getFightState } from './fight-state.js';
import { currentStamina } from './stamina.js';

// Everything the Master needs to pick a game back up, in one read. It never writes.
export function resumeState(db, saveId) {
  const hero = getHero(db, saveId) ?? null;
  const world = worldStatus(db, saveId);
  const { band, collapsed, mental, hours } = currentStamina(db, saveId);
  return {
    hero,
    world,
    setting: getSetting(db, saveId),
    here: hero && world.complete ? look(db, saveId) : null,
    quests: getProgress(db, saveId),
    fight: getFightState(db, saveId),
    honor: getHonor(db, saveId),
    stamina: { band, collapsed, mental, ...(collapsed ? { hours } : {}) },
  };
}

// One short line per player prompt, so the Master does not spend a tool call to recheck the basics.
// Null until the hero and the world exist.
export function stateLine(db, saveId) {
  const { hero, here, quests, fight, honor, stamina } = resumeState(db, saveId);
  if (!hero || !here) return null;
  const parts = [
    `at ${here.location.name} (${here.location.slot})`,
    `quests ${quests.solved.length}/${quests.total}${quests.remaining.length ? `, next ${quests.remaining[0]}` : ''}`,
    fight
      ? `fight: hero ${fight.hero.hp}/${fight.hero.hpMax} HP vs ${fight.enemy.name} ${fight.enemy.hp}/${fight.enemy.hpMax} HP`
      : 'no fight',
    `stamina ${stamina.collapsed ? `collapsed for ${stamina.hours}h` : stamina.band}`,
    `honor ${honor}`,
  ];
  return `[game] ${parts.join(' | ')}`;
}
