import { SKELETON } from '../world/skeleton.js';

// Kept in its own module so hero.js can ask "is onboarding finished?" without importing world.js.
export function worldStatus(db, saveId) {
  const settingSet = Boolean(db.prepare('SELECT 1 FROM world_settings WHERE save_id = ?').get(saveId));
  const locationsFilled = db.prepare('SELECT COUNT(*) AS n FROM world_locations WHERE save_id = ?').get(saveId).n;
  const npcsFilled = db.prepare('SELECT COUNT(*) AS n FROM world_npcs WHERE save_id = ?').get(saveId).n;
  const locationsTotal = SKELETON.locations.length;
  const npcsTotal = SKELETON.npcs.length;
  const missing = [];
  if (!settingSet) missing.push('setting');
  if (locationsFilled < locationsTotal) missing.push('locations');
  if (npcsFilled < npcsTotal) missing.push('npcs');
  return { settingSet, locationsFilled, locationsTotal, npcsFilled, npcsTotal, missing, complete: missing.length === 0 };
}
