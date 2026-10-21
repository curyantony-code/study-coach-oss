// Pages read out of a vault's PDFs, kept in the app's own database. The vault is only read.
import type { Db } from "../db/client";

export interface IngestedDoc {
  file: string;
  pages: number;
  done: number;
  /** The PDF's size and modified time when it was read, to notice a replaced file. */
  stamp: string | null;
}

export interface IngestedPage {
  page: number;
  markdown: string;
  /** How the page was read: "text" (the PDF's own text), "mac", "tesseract" or "pictures" (kept as images). */
  method: string;
}

export function saveDoc(db: Db, vaultId: string, file: string, pages: number, stamp: string, now: Date): void {
  db.prepare("INSERT INTO ingested_docs (vault_id, file, pages, stamp, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(vault_id, file) DO UPDATE SET pages = excluded.pages, stamp = excluded.stamp").run(vaultId, file, pages, stamp, now.toISOString());
}

export function getDoc(db: Db, vaultId: string, file: string): IngestedDoc | null {
  const row = db.prepare(
    "SELECT d.file, d.pages, d.stamp, (SELECT COUNT(*) FROM ingested_pages p WHERE p.vault_id = d.vault_id AND p.file = d.file) AS done FROM ingested_docs d WHERE d.vault_id = ? AND d.file = ?"
  ).get(vaultId, file) as unknown as IngestedDoc | undefined;
  return row ?? null;
}

export function listDocs(db: Db, vaultId: string): IngestedDoc[] {
  return db.prepare(
    "SELECT d.file, d.pages, d.stamp, (SELECT COUNT(*) FROM ingested_pages p WHERE p.vault_id = d.vault_id AND p.file = d.file) AS done FROM ingested_docs d WHERE d.vault_id = ? ORDER BY d.file"
  ).all(vaultId) as unknown as IngestedDoc[];
}

export function savePage(db: Db, vaultId: string, file: string, page: IngestedPage, now: Date): void {
  db.prepare(
    "INSERT INTO ingested_pages (vault_id, file, page, markdown, method, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(vault_id, file, page) DO UPDATE SET markdown = excluded.markdown, method = excluded.method, created_at = excluded.created_at"
  ).run(vaultId, file, page.page, page.markdown, page.method, now.toISOString());
}

export function donePages(db: Db, vaultId: string, file: string): Set<number> {
  const rows = db.prepare("SELECT page FROM ingested_pages WHERE vault_id = ? AND file = ?").all(vaultId, file) as unknown as { page: number }[];
  return new Set(rows.map((row) => row.page));
}

export function getPages(db: Db, vaultId: string, file: string): IngestedPage[] {
  return db.prepare("SELECT page, markdown, method FROM ingested_pages WHERE vault_id = ? AND file = ? ORDER BY page").all(vaultId, file) as unknown as IngestedPage[];
}

export function forgetDoc(db: Db, vaultId: string, file: string): void {
  db.prepare("DELETE FROM ingested_pages WHERE vault_id = ? AND file = ?").run(vaultId, file);
  db.prepare("DELETE FROM ingested_docs WHERE vault_id = ? AND file = ?").run(vaultId, file);
}
