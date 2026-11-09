import { getHero } from './hero.js';
import { t } from './i18n.js';
import { colorForLeft, paint } from './stamina.js';
import { readVitals } from './vitals.js';
import { countItems } from './inventory.js';

const whole = (value) => (Number.isFinite(value) ? Math.round(value) : 0);

// The line above the stamina bar: who the hero is and how they are doing. The color follows health
// with the same cut as the bar.
export function renderHeroLine(info, { color = false, lang = 'en' } = {}) {
  const maxHp = Math.max(0, whole(info.maxHp));
  const hp = Math.min(maxHp, Math.max(0, whole(info.hp)));
  const line = t(lang, 'hero.line', {
    name: info.name,
    level: whole(info.level),
    hp,
    maxHp,
    gold: Math.max(0, whole(info.gold)),
    items: t(lang, 'hero.items', { count: Math.max(0, whole(info.items)) }),
    location: info.location,
  });
  const left = maxHp === 0 ? 0 : Math.round((hp / maxHp) * 100);
  return color ? paint(colorForLeft(left), line) : line;
}

// Everything the hero line shows, read from the save. Reads only, so the status line can use it.
export function heroLineInfo(db, saveId, nowMs = Date.now()) {
  const hero = getHero(db, saveId);
  if (!hero) return null;
  const vitals = readVitals(db, saveId, nowMs);
  const place = db
    .prepare('SELECT name FROM world_locations WHERE save_id = ? AND slot = ?')
    .get(saveId, hero.locationSlot);
  return {
    name: hero.name,
    level: hero.level,
    hp: vitals.hp,
    maxHp: vitals.maxHp,
    gold: vitals.gold,
    items: countItems(db, saveId),
    location: place?.name ?? hero.locationSlot ?? '',
  };
}
