// Stamina is the player's real 5 hour usage window. This file holds the pure math: the tiredness
// bands (one table, tune it here), reading the status line payload, and drawing the bar.
import { inTransaction } from './db.js';

export const WINDOW_MS = 5 * 60 * 60 * 1000;
export const COLLAPSE_AT = 98;

// Lowest used percent of each band, checked from the top. Penalties apply to the hero's attack and AC.
const BANDS = [
  { from: COLLAPSE_AT, band: 'collapsed', penalty: -3 },
  { from: 95, band: 'spent', penalty: -3 },
  { from: 80, band: 'weary', penalty: -2 },
  { from: 60, band: 'tired', penalty: -1 },
  { from: 0, band: 'fresh', penalty: 0 },
];

const clampPercent = (value) => {
  const n = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
};

export function bandFor(usedPercent) {
  const used = clampPercent(usedPercent);
  const { band, penalty } = BANDS.find((b) => used >= b.from);
  return { band, attack: penalty, ac: penalty, mental: used >= 60, collapsed: used >= COLLAPSE_AT };
}

// The status line gets a big JSON object on stdin. Only the five hour window counts.
export function parsePayload(payload) {
  const window = payload?.rate_limits?.five_hour;
  if (window === null || typeof window !== 'object') return null;
  const { used_percentage: usedPercent, resets_at: resetsAt } = window;
  if (!Number.isFinite(usedPercent) || usedPercent < 0 || usedPercent > 100) return null;
  // Epoch seconds. A value in milliseconds or a huge one is a bad payload, not a long window.
  if (!Number.isFinite(resetsAt) || resetsAt <= 0 || resetsAt >= 1e11) return null;
  return { usedPercent, resetsAt };
}

function untilReset(resetsAt, nowMs) {
  const minutes = Math.max(0, Math.round((resetsAt * 1000 - nowMs) / 60000));
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`;
}

const ANSI = { green: 32, yellow: 33, red: 31 };

// Green from 100 to 60 left, yellow from 59 to 40, red from 39 to 0, judged on the same whole
// number the bar shows.
export function barColor(usedPercent) {
  const left = Math.round(100 - clampPercent(usedPercent));
  return left >= 60 ? 'green' : left >= 40 ? 'yellow' : 'red';
}

export function renderBar({ usedPercent, resetsAt, estimated }, nowMs, width = 10, { color = false } = {}) {
  const left = Math.round(100 - clampPercent(usedPercent));
  const filled = Math.round((left / 100) * width);
  const bar = `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
  const reset = `resets in ${untilReset(resetsAt, nowMs)}`;
  const line = estimated ? `STAMINA ~${bar} ~${left}% left (est.) | ${reset}` : `STAMINA ${bar} ${left}% left | ${reset}`;
  return color ? `\u001b[${ANSI[barColor(usedPercent)]}m${line}\u001b[0m` : line;
}

const FRESH_MS = 15 * 60 * 1000;
const MAX_RESET_AHEAD_MS = 6 * 60 * 60 * 1000;

// The status line calls this with the real reading. One row per save, no history.
export function recordReading(db, saveId, { usedPercent, resetsAt }, nowMs = Date.now()) {
  db.prepare(
    `INSERT INTO stamina (save_id, used_percent, resets_at, read_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (save_id) DO UPDATE SET used_percent = excluded.used_percent, resets_at = excluded.resets_at, read_at = excluded.read_at`,
  ).run(saveId, usedPercent, resetsAt, nowMs);
}

// Every game command calls this. It starts the fallback estimate window and keeps it for 5 hours.
export function touchWindow(db, saveId, nowMs = Date.now()) {
  inTransaction(db, () => {
    db.prepare(
      `INSERT INTO stamina (save_id, window_started_at) VALUES (?, ?)
       ON CONFLICT (save_id) DO UPDATE SET window_started_at = CASE
         WHEN window_started_at IS NULL OR ? - window_started_at >= ? THEN excluded.window_started_at
         ELSE window_started_at END`,
    ).run(saveId, nowMs, nowMs, WINDOW_MS);
  });
}

// The real reading while its window is still open (marked estimated once it is older than 15 minutes,
// but still the best data: usage only grows inside a window). With no usable reading, the game-time estimate.
// A reading from the future or with a reset time more than 6 hours away is not usable.
export function currentStamina(db, saveId, nowMs = Date.now()) {
  const row = db.prepare('SELECT * FROM stamina WHERE save_id = ?').get(saveId);
  const usable =
    row?.used_percent != null &&
    row.read_at <= nowMs &&
    row.resets_at * 1000 > nowMs &&
    row.resets_at * 1000 <= nowMs + MAX_RESET_AHEAD_MS;
  const fresh = usable && nowMs - row.read_at <= FRESH_MS;
  let usedPercent;
  let resetsAt;
  if (usable) {
    ({ used_percent: usedPercent, resets_at: resetsAt } = row);
  } else {
    const started = row?.window_started_at != null && nowMs - row.window_started_at < WINDOW_MS ? row.window_started_at : nowMs;
    usedPercent = ((nowMs - started) / WINDOW_MS) * 100;
    resetsAt = Math.floor((started + WINDOW_MS) / 1000);
  }
  const hours = Math.max(1, Math.ceil((resetsAt * 1000 - nowMs) / 3600000));
  return { usedPercent, resetsAt, estimated: !fresh, hours, ...bandFor(usedPercent) };
}
