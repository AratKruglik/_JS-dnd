import { getHero } from './hero.js';
import { getHonor } from './honor.js';
import { worldStatus, getSetting, look } from './world.js';
import { getProgress } from './quests.js';
import { getFightState } from './fight-state.js';
import { currentStamina } from './stamina.js';
import { readVitals } from './vitals.js';
import { countItems } from './inventory.js';
import { displayName } from './rules.js';
import { effectiveLanguage, getLanguage, packFor } from './i18n.js';

// Everything the Master needs to pick a game back up, in one read. It never writes, and it uses only
// modules that do not depend on the sealed dice files, so the play hook can run when they are broken.
// The `resume` command, the line after a compaction, and the per-prompt line all come from here.
export function resumeState(db, saveId) {
  const lang = effectiveLanguage(db, saveId);
  const found = getHero(db, saveId);
  const hero = found
    ? {
        ...found,
        raceDisplay: displayName('race', found.race, lang),
        classDisplay: displayName('class', found.heroClass, lang),
      }
    : null;
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
    vitals: found ? { ...readVitals(db, saveId), items: countItems(db, saveId) } : null,
    language: getLanguage(db, saveId),
    pack: packFor(lang),
  };
}

// One short line per player prompt, so the Master does not spend a tool call to recheck the basics.
// Null until the hero and the world exist.
export function stateLine(db, saveId) {
  const { hero, here, quests, fight, honor, stamina, vitals } = resumeState(db, saveId);
  if (!hero || !here) return null;
  // The labels are English in every language: the Master reads this line, the player never does.
  const parts = [
    `at ${here.location.name} (${here.location.slot})`,
    `HP ${vitals.hp}/${vitals.maxHp}`,
    `${vitals.gold} gold`,
    `quests ${quests.solved.length}/${quests.total}${quests.remaining.length ? `, next ${quests.remaining[0]}` : ''}`,
    fight
      ? `fight: hero ${fight.hero.hp}/${fight.hero.hpMax} HP vs ${fight.enemy.name} ${fight.enemy.hp}/${fight.enemy.hpMax} HP`
      : 'no fight',
    `stamina ${stamina.collapsed ? `collapsed for ${stamina.hours}h` : stamina.band}`,
    `honor ${honor}`,
  ];
  return `[game] ${parts.join(' | ')}`;
}
