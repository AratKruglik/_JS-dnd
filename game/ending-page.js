// Turns the ending stats into one self-contained HTML file: inline CSS, inline SVG charts, no
// script, no network. Every piece of text that came from the game or the player is escaped.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (ch) => ENTITIES[ch]);

const PAD = { left: 44, right: 14, top: 16, bottom: 28 };
const fmt = (n) => (Math.round(n * 10) / 10).toString();

// A step or plain line chart. Points with a non finite x or y are dropped, so bad data can only
// make the chart emptier, never broken.
export function lineChart(points, { width = 640, height = 220, yMin, yMax, label = '', marks = [], step = true } = {}) {
  const pts = points.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  const open = `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${escapeHtml(label)}"><title>${escapeHtml(label)}</title>`;
  if (!pts.length) {
    return `${open}<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="muted">No data yet</text></svg>`;
  }

  let lo = Number.isFinite(yMin) ? yMin : Math.min(...pts.map((p) => p.y));
  let hi = Number.isFinite(yMax) ? yMax : Math.max(...pts.map((p) => p.y));
  if (hi <= lo) {
    lo -= 1;
    hi += 1;
  }
  const x0 = Math.min(...pts.map((p) => p.x));
  const x1 = Math.max(...pts.map((p) => p.x));
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const sx = (x) => (x1 > x0 ? PAD.left + ((x - x0) / (x1 - x0)) * innerW : PAD.left + innerW / 2);
  const sy = (y) => PAD.top + (1 - (Math.min(hi, Math.max(lo, y)) - lo) / (hi - lo)) * innerH;

  let path = '';
  pts.forEach((p, i) => {
    path += i === 0 ? `M${fmt(sx(p.x))} ${fmt(sy(p.y))}` : step ? ` L${fmt(sx(p.x))} ${fmt(sy(pts[i - 1].y))} L${fmt(sx(p.x))} ${fmt(sy(p.y))}` : ` L${fmt(sx(p.x))} ${fmt(sy(p.y))}`;
  });

  const grid = [lo, (lo + hi) / 2, hi]
    .map(
      (v) =>
        `<line x1="${PAD.left}" x2="${width - PAD.right}" y1="${fmt(sy(v))}" y2="${fmt(sy(v))}" class="grid"/><text x="${PAD.left - 6}" y="${fmt(sy(v) + 4)}" text-anchor="end" class="muted">${escapeHtml(fmt(v))}</text>`,
    )
    .join('');
  const lines = marks
    .filter((m) => Number.isFinite(m?.x) && m.x >= x0 && m.x <= x1)
    .map(
      (m) =>
        `<line x1="${fmt(sx(m.x))}" x2="${fmt(sx(m.x))}" y1="${PAD.top}" y2="${height - PAD.bottom}" class="mark"><title>${escapeHtml(m.label)}</title></line>`,
    )
    .join('');
  const dots = pts
    .slice(-300)
    .map((p) => `<circle cx="${fmt(sx(p.x))}" cy="${fmt(sy(p.y))}" r="3" class="dot"><title>${escapeHtml(p.note ?? fmt(p.y))}</title></circle>`)
    .join('');
  return `${open}${grid}${lines}<path d="${path}" class="line" fill="none"/>${dots}</svg>`;
}

const duration = (minutes) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
const day = (iso) => String(iso ?? '').slice(0, 10);

const CSS = `
:root { --bg: #fbfaf7; --fg: #1f1d1a; --muted: #6b665e; --card: #ffffff; --line: #d9d4ca; --accent: #8a4b14; --mark: #b3261e; }
@media (prefers-color-scheme: dark) { :root { --bg: #16140f; --fg: #efe9dc; --muted: #a39a89; --card: #1f1c15; --line: #3a352a; --accent: #e0a458; --mark: #ff8a80; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px 16px 48px; background: var(--bg); color: var(--fg); font: 16px/1.5 Georgia, 'Times New Roman', serif; }
main { max-width: 760px; margin: 0 auto; }
h1 { font-size: 2rem; margin: 0 0 4px; }
h2 { font-size: 1.15rem; margin: 32px 0 8px; }
.sub, .muted { color: var(--muted); fill: var(--muted); font-size: 0.9rem; }
.grid-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 20px; }
.stat { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.stat b { display: block; font-size: 1.6rem; color: var(--accent); }
.stat span { color: var(--muted); font-size: 0.9rem; }
svg { background: var(--card); border: 1px solid var(--line); border-radius: 8px; }
svg .grid { stroke: var(--line); stroke-width: 1; }
svg .line { stroke: var(--accent); stroke-width: 2; }
svg .dot { fill: var(--accent); }
svg .mark { stroke: var(--mark); stroke-width: 1.5; stroke-dasharray: 4 3; }
table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); font-size: 0.95rem; }
th { color: var(--muted); font-weight: normal; }
`;

const stat = (value, label) => `<div class="stat"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;

export function renderPage(stats) {
  const hero = stats.hero;
  const name = hero ? hero.name : 'The hero';
  const who = hero ? `${hero.race} ${hero.heroClass}` : '';
  const world = stats.setting ? stats.setting.name : '';
  const parse = (iso) => Date.parse(iso);

  const honorPoints = stats.honor.map((h) => ({ x: parse(h.at), y: h.honor, note: `${h.honor}: ${h.reason}` }));
  const falls = stats.honor.filter((h) => h.kind === 'reset').map((h) => ({ x: parse(h.at), label: 'A fall: the dice were tampered with' }));
  const complexityPoints = stats.complexity.map((c) => ({ x: parse(c.at), y: c.cumulative, note: `${c.cumulative} total` }));

  const rows = stats.tasks.list
    .map(
      (t) =>
        `<tr><td>${escapeHtml(t.title)}</td><td>${escapeHtml(t.rung ?? '')}</td><td>${escapeHtml(t.complexity)}</td><td>${escapeHtml(t.hintsUsed)}</td><td>${escapeHtml(day(t.solvedAt))}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(name)}: the end of the road</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>${escapeHtml(name)}</h1>
<p class="sub">${escapeHtml([who, world].filter(Boolean).join(' in '))}</p>
<div class="grid-stats">
${stat(duration(stats.minutes), 'Time played (estimated)')}
${stat(`${stats.tasks.solved} of ${stats.tasks.total}`, 'Tasks solved')}
${stat(stats.enemiesDefeated, 'Enemies defeated')}
${stat(stats.fights, 'Fights fought')}
${stat(stats.falls, 'Falls')}
</div>
<h2>Honor over time</h2>
${lineChart(honorPoints, { yMin: -100, yMax: 100, label: 'Honor over time', marks: falls })}
<p class="sub">Dashed red lines mark a fall.</p>
<h2>Complexity you took on</h2>
${lineChart(complexityPoints, { yMin: 0, label: 'Cumulative quest complexity over time' })}
<h2>Quests</h2>
<table>
<tr><th>Quest</th><th>Rung</th><th>Complexity</th><th>Hints</th><th>Solved</th></tr>
${rows}
</table>
</main>
</body>
</html>
`;
}
