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
  {
    version: 2,
    sql: `
CREATE TABLE quest_attempts (
  id INTEGER PRIMARY KEY,
  save_id INTEGER NOT NULL REFERENCES saves (id),
  quest_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'error', 'timeout')),
  expected TEXT NOT NULL,
  got TEXT NOT NULL,
  message TEXT NOT NULL,
  complexity INTEGER NOT NULL
);
CREATE TABLE quest_judgments (
  id INTEGER PRIMARY KEY,
  attempt_id INTEGER NOT NULL UNIQUE REFERENCES quest_attempts (id),
  created_at TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('clean', 'cheated')),
  note TEXT
);
CREATE TABLE quest_solves (
  id INTEGER PRIMARY KEY,
  save_id INTEGER NOT NULL REFERENCES saves (id),
  quest_id TEXT NOT NULL,
  attempt_id INTEGER NOT NULL REFERENCES quest_attempts (id),
  solved_at TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  hints_used INTEGER NOT NULL,
  complexity INTEGER NOT NULL,
  UNIQUE (save_id, quest_id, epoch)
);
CREATE TABLE quest_hints (
  id INTEGER PRIMARY KEY,
  save_id INTEGER NOT NULL REFERENCES saves (id),
  quest_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('npc_speech', 'legal_doc', 'illegal_doc', 'master_leak')),
  note TEXT
);
`,
  },
  {
    // Fingerprint of the player file as it was when step 1 ran, so step 2 can refuse to
    // judge code that changed (or rewrote itself) after the check.
    version: 3,
    sql: `
ALTER TABLE quest_attempts ADD COLUMN file_sha256 TEXT;
`,
  },
  {
    // Hero creation details and where the hero stands in the world (every hero starts at L1).
    version: 4,
    sql: `
ALTER TABLE heroes ADD COLUMN race_description TEXT;
ALTER TABLE heroes ADD COLUMN class_description TEXT;
ALTER TABLE heroes ADD COLUMN location_slot TEXT NOT NULL DEFAULT 'L1';
`,
  },
  {
    // The Master's content for the fixed skeleton: setting, location names, and NPCs.
    version: 5,
    sql: `
CREATE TABLE world_settings (
  id INTEGER PRIMARY KEY,
  save_id INTEGER NOT NULL UNIQUE REFERENCES saves (id),
  created_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('offered', 'customized', 'written')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  voice TEXT NOT NULL
);
CREATE TABLE world_locations (
  id INTEGER PRIMARY KEY,
  save_id INTEGER NOT NULL REFERENCES saves (id),
  slot TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  UNIQUE (save_id, slot),
  UNIQUE (save_id, name)
);
CREATE TABLE world_npcs (
  id INTEGER PRIMARY KEY,
  save_id INTEGER NOT NULL REFERENCES saves (id),
  slot TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  voice TEXT NOT NULL,
  UNIQUE (save_id, slot),
  UNIQUE (save_id, name)
);
`,
  },
  {
    // Combat: fight state lives on the fights row (one enemy per fight), plus NPC warnings.
    version: 6,
    sql: `
ALTER TABLE fights ADD COLUMN aggressor TEXT CHECK (aggressor IN ('hero', 'npc'));
ALTER TABLE fights ADD COLUMN npc_slot TEXT;
ALTER TABLE fights ADD COLUMN quest_id TEXT;
ALTER TABLE fights ADD COLUMN enemy_name TEXT;
ALTER TABLE fights ADD COLUMN enemy_tier TEXT;
ALTER TABLE fights ADD COLUMN enemy_hp INTEGER;
ALTER TABLE fights ADD COLUMN enemy_hp_max INTEGER;
ALTER TABLE fights ADD COLUMN enemy_ac INTEGER;
ALTER TABLE fights ADD COLUMN hero_hp INTEGER;
ALTER TABLE fights ADD COLUMN hero_hp_max INTEGER;
ALTER TABLE fights ADD COLUMN round INTEGER NOT NULL DEFAULT 1;
CREATE TABLE npc_warnings (
  save_id INTEGER NOT NULL REFERENCES saves (id),
  npc_slot TEXT NOT NULL,
  count INTEGER NOT NULL,
  last_reason TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (save_id, npc_slot)
);
`,
  },
  {
    // Advanced combat moves: a Master-written JS problem whose tests stay hidden from the player.
    version: 7,
    sql: `
CREATE TABLE fight_moves (
  id INTEGER PRIMARY KEY,
  fight_id INTEGER NOT NULL REFERENCES fights (id),
  created_at TEXT NOT NULL,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  tests TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'won', 'failed'))
);
`,
  },
  {
    // A won fight knocks the NPC out until the hero's next quest solve (solve count at that moment).
    version: 8,
    sql: `
CREATE TABLE npc_knockouts (
  save_id INTEGER NOT NULL REFERENCES saves (id),
  npc_slot TEXT NOT NULL,
  solves_at_knockout INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (save_id, npc_slot)
);
`,
  },
  {
    // The latest real usage reading from the status line, plus the start of the fallback estimate window.
    version: 9,
    sql: `
CREATE TABLE stamina (
  save_id INTEGER PRIMARY KEY REFERENCES saves (id),
  used_percent REAL,
  resets_at INTEGER,
  read_at INTEGER,
  window_started_at INTEGER
);
`,
  },
  {
    // A player who passes a quest but keeps code that fails the style check takes a small honor hit, once per solve.
    version: 10,
    sql: `
CREATE TABLE style_declines (
  save_id INTEGER NOT NULL REFERENCES saves (id),
  quest_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (save_id, quest_id, epoch)
);
`,
  },
  {
    // A solve the Master later found was cheated is revoked, not deleted: the row stays as history.
    version: 11,
    sql: `
ALTER TABLE quest_solves ADD COLUMN revoked_at TEXT;
`,
  },
  {
    // The language the player chose for this save. Null means not chosen yet, and behaves as English.
    version: 12,
    sql: `
ALTER TABLE saves ADD COLUMN language TEXT CHECK (language IN ('en', 'uk'));
`,
  },
];
