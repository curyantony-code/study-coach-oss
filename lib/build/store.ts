// The inbox: every file waiting to be sorted into a course, with the tags it has been given.
import type { Db } from "../db/client";
import { KINDS, type Kind, type UnitTag } from "./tags";

export type Origin = "upload" | "folder";
/** new: not looked at yet. tagged: sorted, waiting for the student. built: already in a course. */
export type Status = "new" | "tagged" | "built";
/** Who decided the tags: the rules in code, the small model, or the student. */
export type How = "" | "rules" | "model" | "you";

export interface InboxFile {
  id: string;
  name: string;
  /** Where the file is on this computer. */
  path: string;
  origin: Origin;
  /** The folder it came from, so files without a course code can follow their neighbours. */
  folder: string;
  bytes: number;
  status: Status;
  course: string | null;
  kind: Kind;
  unit: UnitTag | null;
  title: string;
  how: How;
  pages: number;
  problem: string | null;
  vaultId: string | null;
  /** Tags the student gave when adding the file (its course, or that it is the outline): tagging leaves them alone. */
  fixed: { course: boolean; kind: boolean };
}

interface Row {
  id: string; name: string; path: string; origin: string; folder: string; bytes: number; status: string; course: string | null; kind: string;
  unit_key: string | null; unit_label: string | null; title: string; how: string; pages: number; problem: string | null; vault_id: string | null; fixed: string | null;
}

function toFile(row: Row): InboxFile {
  return {
    id: row.id, name: row.name, path: row.path, origin: row.origin === "folder" ? "folder" : "upload", folder: row.folder, bytes: row.bytes,
    status: row.status === "tagged" || row.status === "built" ? row.status : "new",
    course: row.course,
    kind: (KINDS as readonly string[]).includes(row.kind) ? (row.kind as Kind) : "other",
    unit: row.unit_key && row.unit_label ? { key: row.unit_key, label: row.unit_label } : null,
    title: row.title,
    how: row.how === "rules" || row.how === "model" || row.how === "you" ? row.how : "",
    pages: row.pages, problem: row.problem, vaultId: row.vault_id,
    fixed: { course: (row.fixed ?? "").includes("course"), kind: (row.fixed ?? "").includes("kind") },
  };
}

export function listInbox(db: Db): InboxFile[] {
  return (db.prepare("SELECT * FROM build_files ORDER BY added_at, name").all() as unknown as Row[]).map(toFile);
}

export function getInboxFile(db: Db, id: string): InboxFile | null {
  const row = db.prepare("SELECT * FROM build_files WHERE id = ?").get(id) as unknown as Row | undefined;
  return row ? toFile(row) : null;
}

/** Adds a file. One already in the inbox from the same place is left as it is. */
export function addInboxFile(db: Db, file: Pick<InboxFile, "id" | "name" | "path" | "origin" | "folder" | "bytes">, now: Date): boolean {
  if (db.prepare("SELECT 1 FROM build_files WHERE path = ?").get(file.path)) return false;
  db.prepare("INSERT INTO build_files (id, name, path, origin, folder, bytes, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(file.id, file.name, file.path, file.origin, file.folder, file.bytes, now.toISOString());
  return true;
}

export interface TagUpdate {
  course: string | null;
  kind: Kind;
  unit: UnitTag | null;
  title: string;
  how: How;
  pages?: number;
  problem?: string | null;
}

export function saveTags(db: Db, id: string, tags: TagUpdate): void {
  db.prepare("UPDATE build_files SET status = CASE WHEN status = 'built' THEN 'built' ELSE 'tagged' END, course = ?, kind = ?, unit_key = ?, unit_label = ?, title = ?, how = ? WHERE id = ?")
    .run(tags.course, tags.kind, tags.unit?.key ?? null, tags.unit?.label ?? null, tags.title, tags.how, id);
  if (tags.pages !== undefined) db.prepare("UPDATE build_files SET pages = ?, problem = ? WHERE id = ?").run(tags.pages, tags.problem ?? null, id);
}

export function markBuilt(db: Db, ids: string[], vaultId: string): void {
  const statement = db.prepare("UPDATE build_files SET status = 'built', vault_id = ? WHERE id = ?");
  for (const id of ids) statement.run(vaultId, id);
}

export function removeInboxFile(db: Db, id: string): void {
  db.prepare("DELETE FROM build_files WHERE id = ?").run(id);
}

/** Sends every file the student has not corrected back to be tagged again. */
export function resetTags(db: Db): void {
  db.prepare("UPDATE build_files SET status = 'new', how = '' WHERE status = 'tagged' AND how != 'you'").run();
}

/** Records what the student said about a file as they added it: which course it is for, or that it is the outline. */
export function presetTags(db: Db, id: string, preset: { course?: string; kind?: Kind }): void {
  const fixed = [preset.course ? "course" : "", preset.kind ? "kind" : ""].filter(Boolean).join(",");
  db.prepare("UPDATE build_files SET course = COALESCE(?, course), kind = COALESCE(?, kind), fixed = ? WHERE id = ?").run(preset.course ?? null, preset.kind ?? null, fixed, id);
}
