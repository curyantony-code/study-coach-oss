// Keeps an up-to-date copy of the database in a folder the student chooses, typically one
// that Google Drive, iCloud or Dropbox uploads by itself. The live database never goes in
// that folder: sync tools corrupt a database that is being written. Only finished copies do.
import fs from "fs";
import os from "os";
import path from "path";
import { getDb } from "../db/client";
import { getSetting, listVaults, setSetting } from "../vault/registry";
import { writeSnapshot } from "./snapshot";

export const LATEST_FILE = "Study Coach backup (latest).db";
const DATED = /^Study Coach backup \d{4}-\d{2}-\d{2}\.db$/;
/** A dated copy per day is kept this many days, so an unwanted change can be undone. */
export const DAYS_KEPT = 14;
/** New answers are copied out at most this often. */
const MIN_GAP_MS = 5 * 60 * 1000;

const FOLDER = "backup:folder";
const LAST = "backup:last";
const LAST_ERROR = "backup:last-error";

export interface BackupStatus {
  folder: string | null;
  /** ISO time of the last copy written to the folder. */
  last: string | null;
  error: string | null;
}

export function backupStatus(): BackupStatus {
  const db = getDb();
  return { folder: getSetting(db, FOLDER) || null, last: getSetting(db, LAST) || null, error: getSetting(db, LAST_ERROR) || null };
}

export function datedName(day: string): string {
  return `Study Coach backup ${day}.db`;
}

/** The dated copies to delete: everything but the newest `keep`. */
export function expired(names: string[], keep: number = DAYS_KEPT): string[] {
  return names.filter((name) => DATED.test(name)).sort().reverse().slice(keep);
}

export type FolderCheck = { ok: true; folder: string } | { ok: false; error: string };

/** A backup folder must exist, be writable, and not sit inside a vault or the app's own data. */
export function checkFolder(input: string, vaultPaths: string[], dataDir: string): FolderCheck {
  const typed = input.trim().replace(/^~(?=\/|$)/, os.homedir());
  if (!typed) return { ok: false, error: "Paste the full path of a folder." };
  if (!path.isAbsolute(typed)) return { ok: false, error: "Use the full path, starting with / (in Finder: right-click the folder, hold Option, choose Copy as Pathname)." };
  const folder = path.resolve(typed);
  const inside = (parent: string) => folder === parent || folder.startsWith(parent + path.sep);
  if (vaultPaths.some((vault) => inside(path.resolve(vault)))) return { ok: false, error: "Choose a folder outside your vaults. Study Coach never saves into a vault this way." };
  if (inside(path.resolve(dataDir))) return { ok: false, error: "Choose a folder outside the app's own data folder, ideally one your cloud drive uploads." };
  try {
    if (!fs.statSync(folder).isDirectory()) return { ok: false, error: "That is a file, not a folder." };
    fs.accessSync(folder, fs.constants.W_OK);
  } catch {
    return { ok: false, error: "That folder does not exist or cannot be written to. (The Docker copy can only reach folders it was given.)" };
  }
  return { ok: true, folder };
}

function dataDir(): string {
  return path.dirname(process.env.STUDY_DB_PATH || path.join(process.cwd(), "data", "study.db"));
}

export function setBackupFolder(input: string): FolderCheck {
  const db = getDb();
  const check = checkFolder(input, listVaults(db).map((v) => v.path), dataDir());
  if (check.ok) {
    setSetting(db, FOLDER, check.folder);
    setSetting(db, LAST_ERROR, "");
  }
  return check;
}

export function clearBackupFolder(): void {
  setSetting(getDb(), FOLDER, "");
}

/** Writes the latest copy and today's dated copy, and tidies old ones. Returns an error message or null. */
export function backUpNow(now: Date = new Date()): string | null {
  const db = getDb();
  const folder = getSetting(db, FOLDER);
  if (!folder) return "Choose a backup folder first.";
  try {
    const latest = path.join(folder, LATEST_FILE);
    writeSnapshot(db, latest);
    fs.copyFileSync(latest, path.join(folder, datedName(now.toISOString().slice(0, 10))));
    for (const name of expired(fs.readdirSync(folder))) fs.rmSync(path.join(folder, name), { force: true });
    setSetting(db, LAST, now.toISOString());
    setSetting(db, LAST_ERROR, "");
    return null;
  } catch (error) {
    console.error("Automatic backup failed", error);
    const message = "The last automatic backup failed. Check that the folder still exists.";
    setSetting(db, LAST_ERROR, message);
    return message;
  }
}

/** True when the database file (or its write-ahead log) was written after `time`. */
function changedSince(time: number): boolean {
  const file = process.env.STUDY_DB_PATH || path.join(process.cwd(), "data", "study.db");
  return [file, `${file}-wal`].some((candidate) => {
    try {
      return fs.statSync(candidate).mtimeMs > time;
    } catch {
      return false;
    }
  });
}

let lastCheck = 0;

/** Called as pages load: copies the database out when a folder is set and enough time has passed. Never throws. */
export function backUpIfDue(now: Date = new Date()): void {
  if (now.getTime() - lastCheck < 30_000) return;
  lastCheck = now.getTime();
  try {
    const { folder, last } = backupStatus();
    if (!folder || (last && now.getTime() - Date.parse(last) < MIN_GAP_MS)) return;
    // Nothing studied since the last copy: nothing to upload again.
    if (last && !changedSince(Date.parse(last))) return;
    backUpNow(now);
  } catch (error) {
    console.error("Checking the automatic backup failed", error);
  }
}
