// Finds a vault's course outline and reads its dates without being asked, so tests show up
// with their dates the first time a course is opened. Only ever reads the vault.
import fs from "fs";
import path from "path";
import { getDb } from "../db/client";
import { extractPdfText, listVaultPdfs, PdfToolMissingError } from "../problems/import";
import { getSetting, setSetting, type Vault } from "../vault/registry";
import { fromLines, parseOutlineSchedule, type OutlineEntry } from "./outline";
import { finalExam } from "./plan";
import { DEFAULT_MINUTES, DEFAULT_STUDY_DAYS, getSchedule, saveSchedule, type StoredSchedule } from "./store";

const OUTLINE_NAME = /outline|syllabus/i;
const WEAKER_NAME = /schedule|calendar/i;
const MAX_OUTLINES_TRIED = 3;
/** Outlines are short; a textbook that happens to be called "…outline…" is not opened. */
const MAX_OUTLINE_BYTES = 15 * 1024 * 1024;
/** A page waits this long for the first read, then carries on; the dates appear on the next page. */
const MAX_WAIT_MS = 2500;

const triedKey = (vaultId: string) => `schedule-auto:${vaultId}`;
const inFlight = new Map<string, Promise<void>>();

/** The PDFs most likely to be the course outline, best first. */
export function likelyOutlines(pdfs: string[]): string[] {
  const score = (file: string) => {
    const name = path.basename(file);
    if (OUTLINE_NAME.test(name)) return 0;
    return WEAKER_NAME.test(name) ? 1 : 2;
  };
  return pdfs
    .filter((file) => score(file) < 2)
    .sort((a, b) => score(a) - score(b) || a.length - b.length)
    .slice(0, MAX_OUTLINES_TRIED);
}

/** Outline text → entries. Text that is already a tidy "date | topic" list is taken as is. */
export function entriesFromText(text: string, year: number): OutlineEntry[] {
  const tidy = fromLines(text);
  return tidy.length >= 3 ? tidy : parseOutlineSchedule(text, year);
}

/** A schedule as first read from an outline: not yet checked by the student. */
export function unconfirmedSchedule(entries: OutlineEntry[], source: string): StoredSchedule {
  const final = finalExam(entries);
  return {
    entries,
    source,
    confirmed: false,
    finalDate: final?.date ?? null,
    finalAssumed: final?.assumed ?? true,
    studyDays: DEFAULT_STUDY_DAYS,
    minutesPerDay: DEFAULT_MINUTES,
    done: [],
  };
}

/**
 * The year an outline is for. A named term ("Fall 2026", "Winter 2027") decides it. Other
 * years in an outline are mostly textbook editions and citations, so they only count when
 * the expected year is not mentioned at all.
 */
export function yearIn(text: string, fallback: number): number {
  const head = text.slice(0, 40_000);
  const near = (year: number) => Math.abs(year - fallback) <= 1;
  const mostCommon = (years: number[]) => {
    const counts = new Map<number, number>();
    for (const year of years.filter(near)) counts.set(year, (counts.get(year) ?? 0) + 1);
    return [...counts].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0]?.[0] ?? null;
  };
  const term = mostCommon([...head.matchAll(/\b(?:fall|autumn|winter|spring|summer)\s+(20\d{2})\b/gi)].map((m) => Number(m[1])));
  if (term !== null) return term;
  const mentioned = [...head.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  return mentioned.includes(fallback) ? fallback : mostCommon(mentioned) ?? fallback;
}

/** Returns true when the search ran to the end, so it need not be repeated. */
async function readOnce(vault: Vault, fallbackYear: number): Promise<boolean> {
  let searched = true;
  for (const file of likelyOutlines(listVaultPdfs(vault.path))) {
    const full = path.join(vault.path, file);
    try {
      if (fs.statSync(full).size > MAX_OUTLINE_BYTES) continue;
      const text = await extractPdfText(full);
      const entries = entriesFromText(text, yearIn(`${file}\n${text}`, fallbackYear));
      // The student may have read an outline themselves while this one was being opened.
      if (getSchedule(vault.id)) return true;
      if (entries.some((e) => e.kind === "class")) {
        saveSchedule(vault.id, unconfirmedSchedule(entries, path.basename(file)));
        return true;
      }
    } catch (error) {
      // Without the PDF tool nothing was really tried: look again once it is installed.
      if (error instanceof PdfToolMissingError) searched = false;
      else console.error(`Reading the outline ${file} failed`, error);
    }
  }
  return searched;
}

/**
 * Reads the outline of a vault that has no schedule yet. Tried once per vault: a vault with
 * no readable outline is not searched again on every page. Never throws, and never holds a
 * page up for long: a slow read finishes in the background.
 */
export async function ensureSchedule(vault: Vault, now: Date = new Date()): Promise<void> {
  const db = getDb();
  if (getSetting(db, triedKey(vault.id)) || getSchedule(vault.id)) return;
  let job = inFlight.get(vault.id);
  if (!job) {
    job = Promise.resolve()
      .then(() => readOnce(vault, now.getFullYear()))
      .then((searched) => {
        if (searched) setSetting(db, triedKey(vault.id), "1");
      })
      .catch((error) => console.error("Looking for the course outline failed", error))
      .finally(() => inFlight.delete(vault.id));
    inFlight.set(vault.id, job);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, MAX_WAIT_MS); });
  await Promise.race([job, timeout]);
  clearTimeout(timer);
}
