// Where uploaded files wait, and how a folder on this computer is looked through. Uploads
// are kept in the app's own data folder; a folder the student points at is only ever read.
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export const MAX_FILE_BYTES = 600 * 1024 * 1024;
export const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_FOLDER_FILES = 600;
const MAX_STEM = 200;
const MAX_DEPTH = 6;
const MAX_FOLDERS_VISITED = 2000;
/** Material worth sorting. Anything else in a folder (system files, recordings) is passed over. */
export const ACCEPTED = new Set([".pdf", ".pptx", ".ppt", ".docx", ".doc", ".md", ".markdown", ".txt", ".xlsx", ".xlsm", ".xls", ".csv", ".png", ".jpg", ".jpeg", ".key", ".pages"]);
/** Housekeeping files that sit beside course material without being part of it. */
const NOT_MATERIAL = /^(readme|claude|agents|license|changelog|index|log)\.(md|markdown|txt)$/i;
const NOT_SEARCHED = new Set(["node_modules", "wiki", "_study-drafts", "mcp-server", "memory", "handover"]);

function dataDir(): string {
  return path.dirname(process.env.STUDY_DB_PATH || path.join(process.cwd(), "data", "study.db"));
}

export function inboxDir(): string {
  return path.join(dataDir(), "inbox");
}

/** A file name with nothing in it that could point outside the inbox. */
export function plainFileName(name: string): string | null {
  const base = name.replace(/\\/g, "/").split("/").pop()!.replace(/[\u0000-\u001f]/g, "").trim();
  if (!base || base === "." || base === "..") return null;
  const extension = path.extname(base);
  if (!ACCEPTED.has(extension.toLowerCase())) return null;
  // Downloaded books can carry names longer than a disk allows: the name is shortened, the file kept.
  let stem = base.slice(0, base.length - extension.length).slice(0, MAX_STEM);
  while (Buffer.byteLength(stem) > MAX_STEM) stem = stem.slice(0, -1);
  return stem.trim() ? `${stem.trim()}${extension}` : null;
}

export function isUploadId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
}

export function newUploadId(): string {
  return randomUUID();
}

/** Each upload has a folder of its own, so two files with the same name never collide. */
export function uploadPath(id: string, name: string): string {
  return path.join(inboxDir(), id, name);
}

/**
 * Adds one piece of an upload to its file. Pieces must arrive in order: `offset` is where
 * this one starts, and a piece that does not start where the file ends is refused.
 */
export function appendChunk(id: string, name: string, offset: number, chunk: Buffer): { ok: true; size: number } | { ok: false; error: string } {
  const file = uploadPath(id, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
  if (offset !== size) return { ok: false, error: "The upload arrived out of order. Try that file again." };
  if (size + chunk.length > MAX_FILE_BYTES) return { ok: false, error: "That file is larger than 600 MB." };
  fs.appendFileSync(file, chunk);
  return { ok: true, size: size + chunk.length };
}

const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

/** Clears out uploads that were started over a day ago and never finished. `finished` are the ids in the inbox. */
export function sweepAbandoned(finished: Set<string>, now: number = Date.now()): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(inboxDir(), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !isUploadId(entry.name) || finished.has(entry.name)) continue;
    const folder = path.join(inboxDir(), entry.name);
    try {
      if (now - fs.statSync(folder).mtimeMs > ABANDONED_AFTER_MS) fs.rmSync(folder, { recursive: true, force: true });
    } catch {
      // Being written to right now, or already gone.
    }
  }
}

export function removeUpload(id: string): void {
  if (isUploadId(id)) fs.rmSync(path.join(inboxDir(), id), { recursive: true, force: true });
}

export interface FolderFile {
  id: string;
  name: string;
  path: string;
  /** Folder inside the one that was picked, "" for its top level. */
  folder: string;
  bytes: number;
}

/** A stable id for a file that stays where it is. */
export function referenceId(file: string): string {
  return `f-${createHash("sha1").update(file).digest("hex").slice(0, 20)}`;
}

/** Every file worth sorting under a folder. Hidden folders and a vault's own notes are skipped. */
export function filesUnder(root: string): { files: FolderFile[]; more: boolean } {
  const files: FolderFile[] = [];
  let visited = 0;
  let more = false;
  const walk = (dir: string, rel: string, depth: number) => {
    if (depth > MAX_DEPTH || ++visited > MAX_FOLDERS_VISITED) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!NOT_SEARCHED.has(entry.name.toLowerCase())) walk(full, rel ? `${rel}/${entry.name}` : entry.name, depth + 1);
      } else if (entry.isFile() && ACCEPTED.has(path.extname(entry.name).toLowerCase()) && !NOT_MATERIAL.test(entry.name)) {
        if (files.length >= MAX_FOLDER_FILES) {
          more = true;
          return;
        }
        const bytes = fs.statSync(full).size;
        if (bytes > 0 && bytes <= MAX_FILE_BYTES) files.push({ id: referenceId(full), name: entry.name, path: full, folder: rel, bytes });
      }
    }
  };
  walk(root, "", 0);
  return { files, more };
}
