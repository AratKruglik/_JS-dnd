import { getHero } from './hero.js';
import { getProgress } from './quests.js';
import { getSetting } from './world.js';
import { QUESTS } from '../quests/index.js';

const MAX_GAP_MS = 30 * 60 * 1000;

// Time spent playing, estimated: the gaps between logged events, ignoring any gap over the limit
// (the player went away). Junk entries are dropped.
export function activeSeconds(timestampsMs, maxGapMs = MAX_GAP_MS) {
  const times = timestampsMs.filter((t) => typeof t === 'number' && Number.isFinite(t) && t >= 0).sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    if (gap <= maxGapMs) total += gap;
  }
  return total / 1000;
}

// Every table that stamps the time something happened, scoped to one save.
const TIMESTAMP_QUERIES = [
  'SELECT created_at AS t FROM heroes WHERE save_id = ?1',
  'SELECT created_at AS t FROM dice_rolls WHERE save_id = ?1',
  'SELECT created_at AS t FROM honor_events WHERE save_id = ?1',
  'SELECT created_at AS t FROM resets WHERE save_id = ?1',
  'SELECT created_at AS t FROM quest_attempts WHERE save_id = ?1',
  'SELECT j.created_at AS t FROM quest_judgments j JOIN quest_attempts a ON a.id = j.attempt_id WHERE a.save_id = ?1',
  'SELECT solved_at AS t FROM quest_solves WHERE save_id = ?1',
  'SELECT created_at AS t FROM quest_hints WHERE save_id = ?1',
  'SELECT started_at AS t FROM fights WHERE save_id = ?1',
  'SELECT ended_at AS t FROM fights WHERE save_id = ?1 AND ended_at IS NOT NULL',
  'SELECT l.created_at AS t FROM fight_log l JOIN fights f ON f.id = l.fight_id WHERE f.save_id = ?1',
  'SELECT m.created_at AS t FROM fight_moves m JOIN fights f ON f.id = m.fight_id WHERE f.save_id = ?1',
];

function allTimestamps(db, saveId) {
  const times = [];
  for (const sql of TIMESTAMP_QUERIES) {
    for (const row of db.prepare(sql).all(saveId)) times.push(Date.parse(row.t));
  }
  return times;
}

// Plain data for the ending page. Nothing here is formatted for display.
export function collectStats(db, saveId) {
  const hero = getHero(db, saveId);
  const progress = getProgress(db, saveId);
  const minutes = Math.round(activeSeconds(allTimestamps(db, saveId)) / 60);

  const solves = db
    .prepare('SELECT quest_id, solved_at, epoch, hints_used, complexity FROM quest_solves WHERE save_id = ? ORDER BY solved_at, id')
    .all(saveId);
  let running = 0;
  const complexity = solves.map((s) => ({ at: s.solved_at, cumulative: (running += s.complexity) }));

  const fightCount = (extra = '') =>
    db.prepare(`SELECT COUNT(*) AS n FROM fights WHERE save_id = ? AND enemy_hp IS NOT NULL${extra}`).get(saveId).n;

  return {
    hero: hero && { name: hero.name, race: hero.race, heroClass: hero.heroClass, level: hero.level },
    setting: getSetting(db, saveId) && { name: getSetting(db, saveId).name },
    minutes,
    hoursEstimated: Math.round(minutes / 6) / 10,
    enemiesDefeated: fightCount(" AND outcome = 'won'"),
    fights: fightCount(),
    falls: db.prepare('SELECT COUNT(*) AS n FROM resets WHERE save_id = ?').get(saveId).n,
    tasks: {
      solved: progress.solved.length,
      total: progress.total,
      list: solves.map((s) => {
        const quest = QUESTS.find((q) => q.id === s.quest_id);
        return {
          id: s.quest_id,
          title: quest?.title ?? s.quest_id,
          rung: quest?.rung ?? null,
          complexity: s.complexity,
          solvedAt: s.solved_at,
          hintsUsed: s.hints_used,
          epoch: s.epoch,
        };
      }),
    },
    honor: db
      .prepare('SELECT created_at, honor_after, kind, reason FROM honor_events WHERE save_id = ? ORDER BY id')
      .all(saveId)
      .map((h) => ({ at: h.created_at, honor: h.honor_after, kind: h.kind, reason: h.reason })),
    complexity,
  };
}
