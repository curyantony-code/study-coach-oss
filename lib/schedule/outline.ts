// Reads the class-by-class schedule out of a course outline: which topic is taught on which
// date, and where the tests fall. Outlines are tables turned into text, so this is a best
// effort that the student then checks and corrects (see `toLines` / `fromLines`).

export type EntryKind = "class" | "test" | "final" | "break" | "deadline";

export interface OutlineEntry {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  kind: EntryKind;
  /** What is taught, or the name of the test. */
  title: string;
  /** Textbook chapters named for that class. */
  chapters: number[];
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTH = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?";
const WEEKDAY = "(?:(?:Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)[a-z]*\\.?,?\\s+)?";
/** A date at the start of a table row, after at most a row label ("3", "Week 3", "Final", "-"). */
const ROW_DATE = new RegExp(`^\\s{0,24}(?:(?:week|session|class|lecture)?\\s*\\d{1,2}[.)]?\\s+|[-–]\\s+|[A-Za-z]{3,7}\\s+)?${WEEKDAY}${MONTH}\\s+(\\d{1,2})(?!\\d)`, "i");
const TABLE_HEADER = /\b(week|date|session|topic|readings?|chapters?|activity|taught|window|nodes|assessment|objectives)\b/gi;
/** Dated rows further apart than this many lines belong to different tables. */
const MAX_ROW_GAP = 12;
const MIN_ROWS = 3;
const STARTS_A_ROW = /^(topic\s+\d|chapter\s+\d|ch\.?\s*\d|week\s+\d|module\s+\d|unit\s+\d|quiz\b|mid-?term|final\b|review\b|\d{1,2}\s{2,}\S)/i;

const FINAL = /\bfinal\s+(exam|examination|test)\b|\bfinal\b(?=.*\bexam)/i;
/** A row is a test when a test is named near its start, or shouted ("TEST 2"). "Test Markets" is a topic. */
const TEST_EARLY = /^.{0,45}?\b(mid-?term|quiz|exam|examination|checkpoint day|test\s*\d)\b/i;
const TEST_SHOUTED = /\bTEST\b|\bQUIZ\b|\bMIDTERM\b/;
const BREAK_EARLY = /^.{0,28}?\b(reading week|no class|no lecture|holiday|study break|thanksgiving|university closed|cancelled)\b/i;
const DEADLINE = /\bdue\b|\bdeadline\b/i;
/** Registrar dates printed near the schedule: not classes. */
const ADMIN = /\b(withdrawal|last day (to|for)|tuition|DNE|DISC|add\/drop)\b/i;
const SHORT_ROW = 70;

/** Limits kept by the store: what is read is cut to them, so an odd outline cannot fail to save. */
export const MAX_ENTRIES = 300;
export const MAX_TITLE = 600;
export const MAX_CHAPTERS = 40;

/** True for a date that exists: "2026-02-31" and "2026-10-45" do not. */
export function isRealDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const time = Date.parse(`${date}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === date;
}

function withinLimits(entries: OutlineEntry[]): OutlineEntry[] {
  return entries
    .filter((entry) => isRealDate(entry.date))
    .slice(0, MAX_ENTRIES)
    .map((entry) => ({ ...entry, title: entry.title.slice(0, MAX_TITLE), chapters: entry.chapters.slice(0, MAX_CHAPTERS) }));
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isHeader(line: string): boolean {
  return (line.match(TABLE_HEADER) ?? []).length >= 2 && !ROW_DATE.test(line);
}

/** "ch. 5 and 6", "Chapters 10 & 11", "Ch. 17", "14.4, 15.1 to 15.5" → chapter numbers. */
export function chaptersIn(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(/\bch(?:apter)?s?\.?\s*((?:\d{1,2}(?:\.\d+)?(?:\s*(?:,|&|and|to|-|–)\s*)?)+)/gi)) {
    for (const number of match[1].matchAll(/\d{1,2}(?:\.\d+)?/g)) found.add(Math.floor(Number(number[0])));
  }
  // Section numbers on their own: "14.4, 15.1 to 15.5" names chapters 14 and 15.
  for (const match of text.matchAll(/\b(\d{1,2})\.\d{1,2}\b/g)) found.add(Number(match[1]));
  return [...found].filter((n) => n >= 1 && n <= 60).sort((a, b) => a - b);
}

/** Collapses a table row's text: column gaps become single spaces, row labels and stray codes go. */
function tidy(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .replace(/-\s+(?=[a-z])/g, "-")
    // Row labels the table printed before the topic: "3 ", "W3 ".
    .replace(/^W?\d{1,2}[\u200b.)]*\s+(?=\D)/, "")
    .replace(/^[-–•]\s*/, "")
    .trim();
}

export function classify(title: string): EntryKind {
  if (BREAK_EARLY.test(title)) return "break";
  if (FINAL.test(title)) return "final";
  if (TEST_EARLY.test(title) || TEST_SHOUTED.test(title)) return "test";
  // A class that also has something due is still a class; a short row that is only a due date is not.
  if (DEADLINE.test(title) && !/\b(topic|chapter|ch\.|cont'?d)\b/i.test(title) && (title.length <= SHORT_ROW || /^due\b/i.test(title))) return "deadline";
  return "class";
}

interface DatedLine {
  line: number;
  month: number;
  day: number;
  /** The row's own text after the date. */
  rest: string;
}

function datedLines(lines: string[]): DatedLine[] {
  return lines.flatMap((text, line) => {
    const match = text.match(ROW_DATE);
    if (!match) return [];
    return [{ line, month: MONTHS[match[1].slice(0, 3).toLowerCase()], day: Number(match[2]), rest: text.slice(match[0].length).replace(/^\s*[-–]\s*\d{1,2}\b(?![-\w])/, "") }];
  });
}

/** The longest run of dated rows that sit close together: the schedule table. */
function scheduleRows(all: DatedLine[]): DatedLine[] {
  let best: DatedLine[] = [];
  let run: DatedLine[] = [];
  for (const row of all) {
    if (run.length > 0 && row.line - run[run.length - 1].line > MAX_ROW_GAP) run = [];
    run.push(row);
    if (run.length > best.length) best = run;
  }
  return best.length >= MIN_ROWS ? best : [];
}

/**
 * Finds the schedule table and returns its rows in date order. `year` is the year the term
 * starts in; months that wrap past December move into the next year.
 */
export function parseOutlineSchedule(text: string, year: number): OutlineEntry[] {
  const lines = text.replace(/\f/g, "\n").split("\n");
  const rows = scheduleRows(datedLines(lines));
  if (rows.length === 0) return [];

  // Some tables centre each cell's text around its date; others start it on the date's line.
  // Text sitting between the table's header and its first date gives the centred kind away.
  let above = rows[0].line - 1;
  const lead: string[] = [];
  while (above >= 0 && rows[0].line - above <= 6 && !isHeader(lines[above])) {
    if (lines[above].trim()) lead.unshift(lines[above]);
    above--;
  }
  const centred = lead.length > 0 && above >= 0 && isHeader(lines[above]);

  // Each row's text: what sits above its date (centred tables only), its own line, what sits below.
  const before: string[][] = rows.map(() => []);
  const after: string[][] = rows.map(() => []);
  if (centred) before[0].push(...lead);
  rows.forEach((row, i) => {
    const next = rows[i + 1];
    const end = next ? next.line : Math.min(lines.length, row.line + 4);
    const gap = Array.from({ length: Math.max(end - row.line - 1, 0) }, (_, k) => row.line + 1 + k);
    if (!next || !centred) {
      // Everything below belongs to this row, up to the first blank line after the last row.
      for (const at of gap) {
        // After the last row, only indented lines are still table cells; a sentence at the margin is not.
        if (!next && (lines[at].trim() === "" || !/^\s{8,}/.test(lines[at]))) break;
        after[i].push(lines[at]);
      }
      return;
    }
    // Centred cells share the gap. It splits at a blank line, or where a line plainly begins
    // something new, or failing both in the middle.
    const blank = gap.find((at) => lines[at].trim() === "");
    const starter = gap.find((at) => STARTS_A_ROW.test(lines[at].trim()));
    const split = blank ?? starter ?? gap[Math.ceil(gap.length / 2)] ?? end;
    for (const at of gap) (at < split ? after[i] : before[i + 1]).push(lines[at]);
  });
  const texts = rows.map((row, i) => [...before[i], row.rest, ...after[i]]);

  let currentYear = year;
  let lastMonth = rows[0].month;
  const entries = rows.map((row, i) => {
    if (row.month < lastMonth - 6) currentYear++;
    lastMonth = row.month;
    const title = tidy(texts[i]);
    return { date: isoDate(currentYear, row.month, row.day), kind: classify(title), title, chapters: chaptersIn(title) };
  });

  // A test often appears twice (in the weekly rows and again in a summary below): keep one.
  const seen = new Set<string>();
  const kept = entries
    .filter((entry) => entry.title !== "" && !ADMIN.test(entry.title))
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((entry) => {
      const key = entry.kind === "class" ? `${entry.date}|class|${entry.title}` : `${entry.date}|${entry.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  // "Dec 9 – Dec 22" is the exam period, not two exams: keep the first day and say so.
  const finals = kept.filter((entry) => entry.kind === "final");
  if (finals.length < 2) return withinLimits(kept);
  const last = finals[finals.length - 1].date;
  return withinLimits(kept.filter((entry) => entry.kind !== "final" || entry === finals[0]).map((entry) => (entry === finals[0] ? { ...entry, title: `Final exam (exam period runs to ${last})` } : entry)));
}

const KIND_WORD: Record<EntryKind, string> = { class: "", test: "TEST", final: "FINAL", break: "BREAK", deadline: "DUE" };

/** One editable line per entry: "2026-09-10 | Topic 1: Risk and return (ch 5, 6)". */
export function toLines(entries: OutlineEntry[]): string {
  return entries.map((e) => [e.date, KIND_WORD[e.kind], e.title].filter(Boolean).join(" | ")).join("\n");
}

/** Reads the student's corrected list back. Lines that do not start with a date are ignored. */
export function fromLines(text: string): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  for (const raw of text.split("\n")) {
    const match = raw.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s*\|\s*(.+)$/);
    if (!match) continue;
    const date = isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (!isRealDate(date)) continue;
    const parts = match[4].split("|").map((p) => p.trim());
    const marked = (Object.entries(KIND_WORD) as [EntryKind, string][]).find(([, word]) => word !== "" && word === parts[0].toUpperCase());
    const title = (marked ? parts.slice(1) : parts).join(" | ").trim();
    if (!title) continue;
    entries.push({ date, kind: marked ? marked[0] : classify(title), title, chapters: chaptersIn(title) });
  }
  return withinLimits(entries.sort((a, b) => a.date.localeCompare(b.date)));
}
