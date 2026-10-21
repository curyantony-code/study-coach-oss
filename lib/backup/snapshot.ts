// Backups of the app's own database: one file that holds every answer, schedule and setting.
// A snapshot is a complete, consistent copy made by SQLite itself, so it is safe to take
// while the app is in use. Vault notes are not included: they live in the vaults.
import fs from "fs";
import path from "path";
import { openDb, type Db } from "../db/client";

/** Tables a file must have to be a Study Coach backup at all. */
const REQUIRED_TABLES = ["vaults", "settings", "students"];
/** Settings that describe this computer, not the student's work: a restore leaves them alone. */
export const LOCAL_SETTINGS = ["backup:folder", "backup:last", "backup:last-error"];
const SQLITE_HEADER = "SQLite format 3\u0000";

export interface BackupSummary {
  vaults: number;
  answers: number;
  /** ISO time of the most recent answer, or null when nothing was studied. */
  lastAnswer: string | null;
}

const quoted = (name: string) => `"${name.replace(/"/g, '""')}"`;

function tables(db: Db, schema = "main"): string[] {
  const rows = db.prepare(`SELECT name FROM ${quoted(schema)}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[];
  return rows.map((row) => row.name);
}

function columns(db: Db, table: string, schema = "main"): string[] {
  return (db.prepare(`PRAGMA ${quoted(schema)}.table_info(${quoted(table)})`).all() as { name: string }[]).map((row) => row.name);
}

export function summarise(db: Db, schema = "main"): BackupSummary {
  const has = new Set(tables(db, schema));
  const count = (table: string) => (has.has(table) ? (db.prepare(`SELECT COUNT(*) AS n FROM ${quoted(schema)}.${quoted(table)}`).get() as { n: number }).n : 0);
  const last = has.has("attempts") ? (db.prepare(`SELECT MAX(created_at) AS at FROM ${quoted(schema)}.attempts`).get() as { at: string | null }).at : null;
  // Courses the student removed stay in the table (their progress is kept) but are not counted.
  const live = has.has("vaults") && columns(db, "vaults", schema).includes("removed_at")
    ? (db.prepare(`SELECT COUNT(*) AS n FROM ${quoted(schema)}.vaults WHERE removed_at IS NULL`).get() as { n: number }).n
    : count("vaults");
  return { vaults: live, answers: count("attempts"), lastAnswer: last };
}

/** Writes a complete copy of the database to `file`. Written beside it first, then moved, so a half-written file is never seen. */
export function writeSnapshot(db: Db, file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const partial = `${file}.partial`;
  fs.rmSync(partial, { force: true });
  db.exec(`VACUUM INTO '${partial.replace(/'/g, "''")}'`);
  fs.renameSync(partial, file);
}

export type BackupCheck = { ok: true; summary: BackupSummary } | { ok: false; error: string };

/** Is this file a usable Study Coach backup? Opens it on its own, never the live database. */
export function checkBackup(file: string): BackupCheck {
  const notOurs = { ok: false as const, error: "That file is not a Study Coach backup." };
  try {
    const head = Buffer.alloc(SQLITE_HEADER.length);
    const handle = fs.openSync(file, "r");
    try {
      fs.readSync(handle, head, 0, head.length, 0);
    } finally {
      fs.closeSync(handle);
    }
    if (head.toString("latin1") !== SQLITE_HEADER) return notOurs;
  } catch {
    return { ok: false, error: "That file could not be opened." };
  }
  let db: Db | null = null;
  try {
    db = openDb(file);
    const found = new Set(tables(db));
    if (!REQUIRED_TABLES.every((table) => found.has(table))) return notOurs;
    const health = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    if (health.integrity_check !== "ok") return { ok: false, error: "That backup file is damaged. Try an older one." };
    return { ok: true, summary: summarise(db) };
  } catch {
    return notOurs;
  } finally {
    db?.close();
  }
}

/**
 * Replaces everything in the live database with the backup's contents, in one transaction:
 * either all of it arrives or nothing changes. Rows are copied table by table rather than
 * swapping the file, so another running copy of the app (the Docker one) is not left holding
 * a file that no longer exists.
 */
export function restoreInto(db: Db, file: string): BackupSummary {
  const keep = db.prepare(`SELECT key, value FROM settings WHERE key IN (${LOCAL_SETTINGS.map(() => "?").join(",")})`).all(...LOCAL_SETTINGS) as { key: string; value: string }[];
  db.prepare("ATTACH DATABASE ? AS backup").run(file);
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      const inBackup = new Set(tables(db, "backup"));
      for (const table of tables(db)) {
        db.exec(`DELETE FROM main.${quoted(table)}`);
        if (!inBackup.has(table)) continue;
        // An older backup may lack newer columns: copy the ones both have.
        const theirs = new Set(columns(db, table, "backup"));
        const shared = columns(db, table).filter((column) => theirs.has(column)).map(quoted).join(", ");
        if (shared) db.exec(`INSERT INTO main.${quoted(table)} (${shared}) SELECT ${shared} FROM backup.${quoted(table)}`);
      }
      const put = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
      db.prepare(`DELETE FROM settings WHERE key IN (${LOCAL_SETTINGS.map(() => "?").join(",")})`).run(...LOCAL_SETTINGS);
      for (const row of keep) put.run(row.key, row.value);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("DETACH DATABASE backup");
  }
  return summarise(db);
}
