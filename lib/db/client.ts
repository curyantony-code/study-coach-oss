import fs from "fs";
import path from "path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

// Loaded through Node itself rather than a normal import: the dev server's hot reload
// cannot re-load a built-in module it has bundled as an external, and every edit to this
// file used to break the app until it was restarted.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS vaults (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    path            TEXT NOT NULL UNIQUE,
    adapter         TEXT NOT NULL DEFAULT 'generic',
    write_enabled   INTEGER NOT NULL DEFAULT 0,
    last_indexed_at TEXT,
    created_at      TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS students (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS profiles (
    student_id INTEGER NOT NULL REFERENCES students(id),
    vault_id   TEXT NOT NULL,
    answers    TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (student_id, vault_id)
  );
  CREATE TABLE IF NOT EXISTS card_state (
    student_id      INTEGER NOT NULL REFERENCES students(id),
    vault_id        TEXT NOT NULL,
    card_id         TEXT NOT NULL,
    node_path       TEXT NOT NULL,
    fsrs            TEXT,
    seen            INTEGER NOT NULL DEFAULT 0,
    correct         INTEGER NOT NULL DEFAULT 0,
    confident_wrong INTEGER NOT NULL DEFAULT 0,
    needs_fix       INTEGER NOT NULL DEFAULT 0,
    guessed_first   INTEGER NOT NULL DEFAULT 0,
    last_seen       TEXT,
    PRIMARY KEY (student_id, vault_id, card_id)
  );
  CREATE TABLE IF NOT EXISTS attempts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  INTEGER NOT NULL REFERENCES students(id),
    vault_id    TEXT NOT NULL,
    card_id     TEXT NOT NULL,
    node_path   TEXT NOT NULL,
    scope       TEXT NOT NULL,
    mode        TEXT NOT NULL,
    correct     INTEGER NOT NULL,
    confidence  TEXT,
    response_ms INTEGER,
    hint_used   INTEGER NOT NULL DEFAULT 0,
    distracted  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS attempts_by_student_vault ON attempts (student_id, vault_id, created_at);
  CREATE TABLE IF NOT EXISTS checkins (
    student_id INTEGER NOT NULL REFERENCES students(id),
    day        TEXT NOT NULL,
    sleep      TEXT NOT NULL,
    PRIMARY KEY (student_id, day)
  );
  CREATE TABLE IF NOT EXISTS explanations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id),
    vault_id   TEXT NOT NULL,
    node_path  TEXT NOT NULL,
    text       TEXT NOT NULL,
    ai_score   INTEGER,
    covered    TEXT NOT NULL DEFAULT '[]',
    missing    TEXT NOT NULL DEFAULT '[]',
    tip        TEXT NOT NULL DEFAULT '',
    self_rated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exam_papers (
    id          TEXT PRIMARY KEY,
    student_id  INTEGER NOT NULL REFERENCES students(id),
    vault_id    TEXT NOT NULL,
    scope       TEXT NOT NULL,
    questions   TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    recorded_at TEXT
  );
  CREATE TABLE IF NOT EXISTS textbook_problems (
    vault_id TEXT NOT NULL,
    chapter  INTEGER NOT NULL,
    kind     TEXT NOT NULL,
    number   INTEGER NOT NULL,
    text     TEXT NOT NULL,
    preamble TEXT,
    PRIMARY KEY (vault_id, chapter, kind, number)
  );
  CREATE TABLE IF NOT EXISTS question_fixes (
    vault_id   TEXT NOT NULL,
    card_id    TEXT NOT NULL,
    text       TEXT NOT NULL,
    basis      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (vault_id, card_id)
  );
  CREATE TABLE IF NOT EXISTS quiz_results (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id),
    vault_id   TEXT NOT NULL,
    taken_at   TEXT NOT NULL,
    topic      TEXT NOT NULL,
    source     TEXT NOT NULL,
    score      INTEGER NOT NULL,
    total      INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ingested_docs (
    vault_id   TEXT NOT NULL,
    file       TEXT NOT NULL,
    pages      INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (vault_id, file)
  );
  CREATE TABLE IF NOT EXISTS ingested_pages (
    vault_id   TEXT NOT NULL,
    file       TEXT NOT NULL,
    page       INTEGER NOT NULL,
    markdown   TEXT NOT NULL,
    method     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (vault_id, file, page)
  );
  CREATE TABLE IF NOT EXISTS build_files (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    path       TEXT NOT NULL,
    origin     TEXT NOT NULL,
    folder     TEXT NOT NULL DEFAULT '',
    bytes      INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'new',
    course     TEXT,
    kind       TEXT NOT NULL DEFAULT 'other',
    unit_key   TEXT,
    unit_label TEXT,
    title      TEXT NOT NULL DEFAULT '',
    how        TEXT NOT NULL DEFAULT '',
    pages      INTEGER NOT NULL DEFAULT 0,
    problem    TEXT,
    vault_id   TEXT,
    added_at   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS video_cache (
    query      TEXT PRIMARY KEY,
    results    TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
`;

/** Columns added after a table first shipped. `CREATE TABLE IF NOT EXISTS` never adds them. */
const ADDED_COLUMNS: { table: string; column: string; definition: string }[] = [
  { table: "vaults", column: "removed_at", definition: "TEXT" },
  { table: "question_fixes", column: "condensed", definition: "TEXT" },
  { table: "ingested_docs", column: "stamp", definition: "TEXT" },
  { table: "build_files", column: "fixed", definition: "TEXT NOT NULL DEFAULT ''" },
];

function migrate(db: DatabaseSyncType): void {
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
    if (columns.some((c) => c.name === column)) continue;
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      // Several build workers open a brand-new database at once: another one may have added it first.
      if (!(error instanceof Error && error.message.includes("duplicate column name"))) throw error;
    }
  }
}

export type Db = DatabaseSyncType;

/** Opens (and creates if needed) a database file. Pass ":memory:" in tests. */
export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // Wait briefly instead of failing if another process (e.g. the Docker copy) holds the file.
  db.exec("PRAGMA busy_timeout = 3000");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

const globalForDb = globalThis as unknown as { studyCoachDb?: Db };
/** Per copy of this module: false again after a code reload, so new tables reach the open connection. */
let schemaApplied = false;

/** The app's single local database: data/study.db (git-ignored). */
export function getDb(): Db {
  if (!globalForDb.studyCoachDb) {
    globalForDb.studyCoachDb = openDb(process.env.STUDY_DB_PATH || path.join(process.cwd(), "data", "study.db"));
    schemaApplied = true;
  }
  if (!schemaApplied) {
    // The connection outlives code reloads during development; bring it up to the current schema.
    globalForDb.studyCoachDb.exec(SCHEMA);
    migrate(globalForDb.studyCoachDb);
    schemaApplied = true;
  }
  return globalForDb.studyCoachDb;
}
