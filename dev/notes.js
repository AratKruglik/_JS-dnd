const now = () => new Date().toISOString();

export function setTask(db, { issueNumber, title, status, detail = null }) {
  db.prepare(
    `INSERT INTO tasks (issue_number, title, status, detail, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (issue_number) DO UPDATE SET
       title = excluded.title,
       status = excluded.status,
       detail = excluded.detail,
       updated_at = excluded.updated_at`,
  ).run(issueNumber, title, status, detail, now());
}

export function addNote(db, { issueNumber, kind, body }) {
  const result = db
    .prepare('INSERT INTO notes (created_at, issue_number, kind, body) VALUES (?, ?, ?, ?)')
    .run(now(), issueNumber, kind, body);
  return Number(result.lastInsertRowid);
}

export function getState(db) {
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY updated_at DESC, issue_number DESC').all();
  const lastCompleted =
    db.prepare("SELECT * FROM notes WHERE kind = 'completed' ORDER BY id DESC LIMIT 1").get() ?? null;
  const predictions = db.prepare("SELECT * FROM notes WHERE kind = 'prediction' ORDER BY id DESC LIMIT 5").all();
  return { tasks, lastCompleted, predictions };
}

export function setMeta(db, key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(
    key,
    value,
  );
}

export function getMeta(db, key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}
