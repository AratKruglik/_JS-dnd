// Ordered migrations for the game DB. Add new versions at the end, never edit an applied one.
export const MIGRATIONS = [
  {
    version: 1,
    sql: `
CREATE TABLE saves (
  id INTEGER PRIMARY KEY,
  name TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE heroes (
  id INTEGER PRIMARY KEY,
  save_id INTEGER NOT NULL UNIQUE REFERENCES saves (id),
  name TEXT NOT NULL,
  race TEXT NOT NULL,
  hero_class TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  created_at TEXT NOT NULL
);
CREATE TABLE hero_abilities (
  hero_id INTEGER NOT NULL REFERENCES heroes (id),
  ability TEXT NOT NULL CHECK (ability IN ('STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA')),
  base INTEGER NOT NULL DEFAULT 8,
  trait_adjust INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hero_id, ability)
);
CREATE TABLE honor_events (
  id INTEGER PRIMARY KEY,
  save_id INTEGER NOT NULL REFERENCES saves (id),
  created_at TEXT NOT NULL,
  delta INTEGER NOT NULL,
  kind TEXT NOT NULL,
  reason TEXT NOT NULL,
  honor_after INTEGER NOT NULL CHECK (honor_after BETWEEN -100 AND 100)
);
CREATE TABLE dice_rolls (
  id INTEGER PRIMARY KEY,
  save_id INTEGER NOT NULL REFERENCES saves (id),
  created_at TEXT NOT NULL,
  spec TEXT NOT NULL,
  results TEXT NOT NULL,
  total INTEGER NOT NULL,
  context TEXT
);
CREATE TABLE fights (
  id INTEGER PRIMARY KEY,
  save_id INTEGER NOT NULL REFERENCES saves (id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  trigger_reason TEXT NOT NULL,
  outcome TEXT CHECK (outcome IN ('won', 'lost', 'fled', 'abandoned'))
);
CREATE TABLE fight_log (
  id INTEGER PRIMARY KEY,
  fight_id INTEGER NOT NULL REFERENCES fights (id),
  seq INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  roll_id INTEGER REFERENCES dice_rolls (id),
  detail TEXT,
  UNIQUE (fight_id, seq)
);
CREATE TABLE resets (
  id INTEGER PRIMARY KEY,
  save_id INTEGER NOT NULL REFERENCES saves (id),
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  fingerprint_expected TEXT NOT NULL,
  fingerprint_found TEXT NOT NULL,
  UNIQUE (save_id, fingerprint_found)
);
`,
  },
];
