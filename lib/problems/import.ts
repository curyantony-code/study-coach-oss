// Imports the full wording of textbook problems from a PDF the owner keeps in the vault.
// The PDF is only read. The extracted text is stored in the app's database, never in the vault.
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { getDb, type Db } from "../db/client";
import { inTransaction } from "../db/progress";
import { getSetting, setSetting } from "../vault/registry";
import type { OriginalsSource } from "./originals";
import { parseProblemSets, textbookKey, type TextbookProblem } from "./textbook";

const MAX_PDFS_LISTED = 200;
const MAX_DEPTH = 6;
/** A vault with more folders than this is not searched to the end: the page must stay quick. */
const MAX_FOLDERS_VISITED = 1500;
const EXTRACT_TIMEOUT_MS = 120_000;
const MAX_TEXT_BYTES = 80 * 1024 * 1024;
const LIKELY_PROBLEMS = /problem|exercise|question/i;

export class PdfToolMissingError extends Error {}

/** PDFs anywhere in the vault (including raw/), likeliest problem-set files first. */
export function listVaultPdfs(vaultPath: string): string[] {
  const found: string[] = [];
  let visited = 0;
  const walk = (dir: string, rel: string, depth: number) => {
    if (depth > MAX_DEPTH || found.length >= MAX_PDFS_LISTED || ++visited > MAX_FOLDERS_VISITED) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") walk(path.join(dir, entry.name), relPath, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
        found.push(relPath);
      }
    }
  };
  walk(vaultPath, "", 0);
  const rank = (p: string) => (LIKELY_PROBLEMS.test(path.basename(p)) ? 0 : 1);
  return found.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true }));
}

/** Converts a PDF to plain text with its layout kept, using the `pdftotext` tool (part of Poppler). */
export function extractPdfText(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Arguments are passed as a list, never through a shell, so a file name cannot be read as a command.
    execFile("pdftotext", ["-layout", "-enc", "UTF-8", file, "-"], { timeout: EXTRACT_TIMEOUT_MS, maxBuffer: MAX_TEXT_BYTES }, (error, stdout) => {
      if (!error) return resolve(stdout);
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return reject(new PdfToolMissingError("Reading PDFs needs the free Poppler tools. In Terminal, run: brew install poppler"));
      }
      reject(error);
    });
  });
}

export interface TextbookImport {
  file: string;
  count: number;
  importedAt: string;
}

const settingKey = (vaultId: string) => `textbook:${vaultId}`;

export function saveTextbook(db: Db, vaultId: string, file: string, problems: TextbookProblem[], now: Date): TextbookImport {
  const summary: TextbookImport = { file, count: problems.length, importedAt: now.toISOString() };
  inTransaction(db, () => {
    db.prepare("DELETE FROM textbook_problems WHERE vault_id = ?").run(vaultId);
    const insert = db.prepare("INSERT OR REPLACE INTO textbook_problems (vault_id, chapter, kind, number, text, preamble) VALUES (?, ?, ?, ?, ?, ?)");
    for (const p of problems) insert.run(vaultId, p.chapter, p.kind, p.number, p.text, p.preamble);
    setSetting(db, settingKey(vaultId), JSON.stringify(summary));
  });
  return summary;
}

export function clearTextbook(db: Db, vaultId: string): void {
  inTransaction(db, () => {
    db.prepare("DELETE FROM textbook_problems WHERE vault_id = ?").run(vaultId);
    db.prepare("DELETE FROM settings WHERE key = ?").run(settingKey(vaultId));
  });
}

export function getTextbookImport(db: Db, vaultId: string): TextbookImport | null {
  const raw = getSetting(db, settingKey(vaultId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TextbookImport;
  } catch {
    return null;
  }
}

/** The imported wording for a vault, ready to be laid over its problem cards. Null when nothing was imported. */
export function loadOriginals(db: Db, vaultId: string): OriginalsSource | null {
  const summary = getTextbookImport(db, vaultId);
  if (!summary) return null;
  const rows = db.prepare("SELECT chapter, kind, number, text, preamble FROM textbook_problems WHERE vault_id = ?").all(vaultId) as unknown as TextbookProblem[];
  return { fileName: path.basename(summary.file), problems: new Map(rows.map((row) => [textbookKey(row), row])) };
}

/** Reads a PDF from the vault, finds its problem sets, and stores their wording for this vault. */
export async function importTextbook(vaultId: string, vaultPath: string, relativeFile: string): Promise<TextbookImport> {
  const text = await extractPdfText(path.join(vaultPath, relativeFile));
  return saveTextbook(getDb(), vaultId, relativeFile, parseProblemSets(text), new Date());
}
