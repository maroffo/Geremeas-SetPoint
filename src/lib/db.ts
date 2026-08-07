import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// DDL condivise tra SCHEMA e MIGRATIONS: un'unica definizione per colonna,
// così DB nuovi (CREATE) e DB migrati (ALTER) restano identici.
const MIN_AGE_DDL = "min_age INTEGER";
const MAX_AGE_DDL = "max_age INTEGER";
const AGE_CONFIRMED_DDL = "age_confirmed INTEGER NOT NULL DEFAULT 0";
const CONTACT_INFO_DDL = "contact_info TEXT";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  team_size INTEGER NOT NULL DEFAULT 4,
  format TEXT NOT NULL DEFAULT 'groups_knockout',
  best_of INTEGER NOT NULL DEFAULT 3,
  points_per_set INTEGER NOT NULL DEFAULT 21,
  points_last_set INTEGER NOT NULL DEFAULT 15,
  advance_per_group INTEGER NOT NULL DEFAULT 2,
  ${MIN_AGE_DDL},
  ${MAX_AGE_DDL},
  ${CONTACT_INFO_DDL},
  status TEXT NOT NULL DEFAULT 'registration',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'registered',
  status TEXT NOT NULL DEFAULT 'pending',
  contact TEXT,
  group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  ${AGE_CONFIRMED_DDL},
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('M','F')),
  skill INTEGER CHECK (skill BETWEEN 1 AND 10),
  contact TEXT,
  team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  is_reserve INTEGER NOT NULL DEFAULT 0,
  ${AGE_CONFIRMED_DDL},
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('group','knockout')),
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  round INTEGER NOT NULL DEFAULT 1,
  bracket_pos INTEGER,
  is_third_place INTEGER NOT NULL DEFAULT 0,
  team_a INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  team_b INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  court TEXT,
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  winner INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  forfeit_team INTEGER REFERENCES teams(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS set_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  points_a INTEGER NOT NULL,
  points_b INTEGER NOT NULL,
  UNIQUE (match_id, set_number)
);

CREATE TABLE IF NOT EXISTS tournament_posters (
  tournament_id INTEGER PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  data BLOB NOT NULL,
  mime TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_teams_tournament ON teams(tournament_id);
CREATE INDEX IF NOT EXISTS idx_players_tournament ON players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_set_scores_match ON set_scores(match_id);
`;

// Colonne aggiunte dopo la prima release: lo SCHEMA (CREATE TABLE IF NOT
// EXISTS) non tocca le tabelle esistenti, quindi i DB già in produzione
// vengono allineati con ALTER TABLE guardati da PRAGMA table_info.
const MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
  { table: "tournaments", column: "min_age", ddl: MIN_AGE_DDL },
  { table: "tournaments", column: "max_age", ddl: MAX_AGE_DDL },
  { table: "tournaments", column: "contact_info", ddl: CONTACT_INFO_DDL },
  { table: "teams", column: "age_confirmed", ddl: AGE_CONFIRMED_DDL },
  { table: "players", column: "age_confirmed", ddl: AGE_CONFIRMED_DDL },
];

export function runMigrations(db: Database.Database): void {
  for (const m of MIGRATIONS) {
    const cols = db.pragma(`table_info(${m.table})`) as Array<{ name: string }>;
    if (!cols.some((c) => c.name === m.column)) {
      try {
        db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.ddl}`);
      } catch (e) {
        // Due processi possono controllare la colonna nello stesso momento:
        // se l'altro ha già fatto l'ALTER, l'obiettivo è comunque raggiunto.
        if (!/duplicate column name/.test(String(e))) throw e;
      }
    }
  }
}

function createDb(): Database.Database {
  const file =
    process.env.DATABASE_PATH ??
    path.join(process.cwd(), "data", "geremeas.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  runMigrations(db);
  return db;
}

// Singleton condiviso, sopravvive all'hot reload in sviluppo.
const g = globalThis as unknown as { __gspDb?: Database.Database };
export const db: Database.Database = g.__gspDb ?? (g.__gspDb = createDb());
