// Stamina is the player's real 5 hour usage window. This file holds the pure math: the tiredness
// bands (one table, tune it here), reading the status line payload, and drawing the bar.
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
  if (!Number.isFinite(usedPercent) || !Number.isFinite(resetsAt)) return null;
  return { usedPercent, resetsAt };
}

function untilReset(resetsAt, nowMs) {
  const minutes = Math.max(0, Math.round((resetsAt * 1000 - nowMs) / 60000));
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`;
}

export function renderBar({ usedPercent, resetsAt, estimated }, nowMs, width = 10) {
  const left = Math.round(100 - clampPercent(usedPercent));
  const filled = Math.round((left / 100) * width);
  const bar = `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
  const reset = `resets in ${untilReset(resetsAt, nowMs)}`;
  return estimated ? `STAMINA ~${bar} ~${left}% left (est.) | ${reset}` : `STAMINA ${bar} ${left}% left | ${reset}`;
}
