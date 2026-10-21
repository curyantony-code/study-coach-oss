// Works out what an uploaded file is from its name and its text: which course it belongs to,
// what kind of material it is, and which chapter or week it covers. All of this is plain
// code. A small model is only asked about what these rules could not decide (lib/build/model.ts).
import path from "path";

export const KINDS = ["outline", "slides", "notes", "textbook", "problems", "solutions", "exam", "other"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABELS: Record<Kind, string> = {
  outline: "Course outline",
  slides: "Lecture slides",
  notes: "Notes",
  textbook: "Textbook",
  problems: "Problem set",
  solutions: "Solutions",
  exam: "Past or practice exam",
  other: "Other",
};

export interface UnitTag {
  /** Short id used in study.yml, e.g. "ch7", "wk3", "topic2". */
  key: string;
  /** What the student sees, e.g. "Chapter 7". */
  label: string;
}

/** What is known about a file before tagging. */
export interface FileFacts {
  name: string;
  /** The file's text, or the start of it. Empty for a scan or a file that could not be read. */
  text: string;
  /** Pages or slides; 0 when the file has none (a note, a text file). */
  pages: number;
  /** The folders the file sat in ("FIN 101/Lecture Notes"), when it came from a folder. */
  folder?: string;
}

export interface Tags {
  /** Course code such as "FIN 101", or null when none was found. */
  course: string | null;
  kind: Kind;
  /** False when the kind is a guess the small model should check. */
  kindSure: boolean;
  unit: UnitTag | null;
  title: string;
}

const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const SLIDE_EXTENSIONS = new Set([".pptx", ".ppt", ".key"]);
const HEAD_CHARS = 6000;
/** A PDF this long is a book, whatever it is called. */
const BOOK_PAGES = 150;
/** Slides carry little text per page; a typed page of notes or a textbook carries far more. */
const SLIDE_CHARS_PER_PAGE = 900;
const MAX_TITLE = 90;

// Upper-case words that are followed by three digits without being a course ("PAGE 112").
const NOT_A_COURSE = new Set([
  "PAGE", "ROOM", "ISBN", "FALL", "WEEK", "UNIT", "TEST", "QUIZ", "EXAM", "PART", "STEP", "NOTE", "FIG", "CFA", "USD", "CAD", "EUR", "IAS",
  "IFRS", "ISO", "DDC", "LCC", "ISSN", "HTTP", "FORM", "CASE", "ITEM", "LINE", "TEL", "EXT", "BOX", "CODE", "RULE", "YEAR", "TERM", "FROM", "OVER", "THAN", "WITH",
]);
const CODE_IN_TEXT = /\b([A-Z]{3,4})[  ]?(\d{3}[A-Z]?)\b/g;
const CODE_IN_NAME = /(?:^|[^a-z])([a-z]{3,4})[ _-]?(\d{3})[a-z]?(?![a-z0-9])/gi;
/** A code in the file's name counts for this many mentions in its text. */
const NAME_WEIGHT = 5;

function tally(counts: Map<string, number>, letters: string, digits: string, weight: number): void {
  const prefix = letters.toUpperCase();
  if (NOT_A_COURSE.has(prefix)) return;
  const code = `${prefix} ${digits.toUpperCase()}`;
  counts.set(code, (counts.get(code) ?? 0) + weight);
}

/** A code in a folder's name counts for this many. */
const FOLDER_WEIGHT = 3;
/** A code seen only in the text, this few times, is a passing mention (a prerequisite, a catalogue number). */
const MIN_TEXT_MENTIONS = 2;
const TITLE_CHARS = 400;

/** Every course code mentioned, with how strongly: the file's name counts for more than its text. */
export function courseCodes(name: string, text: string, folder = "", known: string[] = []): Map<string, number> {
  const named = new Map<string, number>();
  for (const match of path.basename(name).matchAll(CODE_IN_NAME)) tally(named, match[1], match[2], NAME_WEIGHT);
  for (const part of folder.split("/")) for (const match of part.matchAll(CODE_IN_NAME)) tally(named, match[1], match[2], FOLDER_WEIGHT);
  const mentioned = new Map<string, number>();
  // A code on the title page is the file's own; further in, one mention may be a prerequisite.
  for (const match of text.slice(0, HEAD_CHARS).matchAll(CODE_IN_TEXT)) tally(mentioned, match[1], match[2], (match.index ?? 0) < TITLE_CHARS ? MIN_TEXT_MENTIONS : 1);
  // A code in the name or folder settles it; the text then only breaks a tie between such codes.
  if (named.size > 0) return new Map([...named].map(([code, count]) => [code, count + Math.min(mentioned.get(code) ?? 0, 1)]));
  return new Map([...mentioned].filter(([code, count]) => known.includes(code) || count >= MIN_TEXT_MENTIONS));
}

/** The course a file most likely belongs to. A code the student already uses wins a tie. */
export function courseOf(name: string, text: string, known: string[] = [], folder = ""): string | null {
  const ranked = [...courseCodes(name, text, folder, known)].sort((a, b) => b[1] - a[1] || Number(known.includes(b[0])) - Number(known.includes(a[0])) || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? null;
}

const UNIT_WORDS: { pattern: string; prefix: string; word: string }[] = [
  { pattern: "chapters?|chap|ch", prefix: "ch", word: "Chapter" },
  { pattern: "weeks?|wk", prefix: "wk", word: "Week" },
  { pattern: "lectures?|lec|class|session", prefix: "lec", word: "Lecture" },
  { pattern: "topics?", prefix: "topic", word: "Topic" },
  { pattern: "nodes?", prefix: "node", word: "Node" },
  { pattern: "modules?|mod", prefix: "mod", word: "Module" },
  { pattern: "units?", prefix: "unit", word: "Unit" },
];
const MAX_UNIT_NUMBER = 60;

function unitFrom(text: string): UnitTag | null {
  for (const { pattern, prefix, word } of UNIT_WORDS) {
    const match = text.match(new RegExp(`(?:^|[^a-z])(?:${pattern})[ ._#-]{0,2}0*(\\d{1,2})(?!\\d)`, "i"));
    if (!match) continue;
    const number = Number(match[1]);
    if (number >= 1 && number <= MAX_UNIT_NUMBER) return { key: `${prefix}${number}`, label: `${word} ${number}` };
  }
  return null;
}

/** A file longer than this covers several chapters: the first one it mentions is not "its" chapter. */
const MAX_PAGES_FOR_TEXT_UNIT = 60;
const TITLE_UNIT_CHARS = 300;

/** The chapter, week or lecture a file covers: from its name, else (for a short file) from its first lines. */
export function unitOf(name: string, text: string, pages = 0): UnitTag | null {
  const stem = path.basename(name, path.extname(name));
  if (pages > MAX_PAGES_FOR_TEXT_UNIT) return unitFrom(stem);
  // Only a title line counts ("Chapter 3"), not a mention further down or a table of contents.
  const titleLines = text.slice(0, TITLE_UNIT_CHARS).split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 4);
  return unitFrom(stem) ?? titleLines.map((line) => (/^(?:chapter|week|lecture|topic|module|unit|node)\b/i.test(line) ? unitFrom(line) : null)).find((unit) => unit !== null) ?? null;
}

/** Turns what a person typed ("Chapter 7", "wk3", "Risk and return") into a unit, or null for nothing. */
export function unitFromInput(typed: string): UnitTag | null {
  const cleaned = typed.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!cleaned) return null;
  const numbered = unitFrom(cleaned);
  if (numbered && cleaned.length <= 14) return numbered;
  const key = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return key ? { key, label: cleaned } : null;
}

const OUTLINE_SIGNS = [/office hours/i, /grading|grade breakdown|evaluation/i, /course description/i, /learning (?:outcomes|objectives)/i, /academic integrity|plagiarism/i, /prerequisite/i, /instructor/i];

function looksLikeOutline(text: string): boolean {
  const head = text.slice(0, HEAD_CHARS);
  return OUTLINE_SIGNS.filter((sign) => sign.test(head)).length >= 3;
}

/** The kind a name states outright ("…Course Outline", "Solution Manual"), or null when it states none. */
function kindNamed(label: string): Kind | null {
  const stem = label.replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const has = (pattern: RegExp) => pattern.test(stem);
  if (has(/\b(outline|syllabus|plan de cours)\b/i)) return "outline";
  // "SM" is how publishers mark a solutions manual; only in capitals, so "sm" inside a word is not caught.
  if (has(/\b(solutions?|answers?|answer key|corrig)/i) || /(?:^|[ ])SM(?:[ ]|$)/.test(stem)) return "solutions";
  if (has(/\b(mock|practice|sample|past|old) (?:exams?|mid ?terms?|finals?|tests?|quiz)/i) || has(/\b(?:exam|mid ?term) (?:\d{4}|[fw]\d{2})\b/i)) return "exam";
  if (has(/\b(notes?|summary|review|cheat ?sheet|formula sheet|study guide|crash course|booklet)\b/i)) return "notes";
  if (has(/\b(problem sets?|problems|exercises?|assignments?|homework|tutorials?|practice)\b/i)) return "problems";
  if (has(/\b(textbook|edition|\d+(?:st|nd|rd|th)? ?ed|\d+c?e)\b/i)) return "textbook";
  if (has(/\b(slides?|deck|lectures?|lec|ppt)\b/i)) return "slides";
  if (has(/\b(mid ?terms?|exams?|quiz|quizzes)\b/i)) return "exam";
  return null;
}

/** How many folders up from a file its folder names are still taken as describing it. */
const FOLDER_LEVELS = 2;

/** What kind of material a file is. `sure` is false when only weak signs pointed there. */
export function kindOf(facts: FileFacts): { kind: Kind; sure: boolean } {
  const extension = path.extname(facts.name).toLowerCase();
  const sure = (kind: Kind) => ({ kind, sure: true });
  const guess = (kind: Kind) => ({ kind, sure: false });

  const named = kindNamed(path.basename(facts.name, extension));
  if (named) return sure(named);
  if (SLIDE_EXTENSIONS.has(extension)) return sure("slides");
  if (facts.pages >= BOOK_PAGES) return sure("textbook");
  if (looksLikeOutline(facts.text)) return sure("outline");
  // "Lecture Notes/", "Solution Manual/": the student's own folders say what is in them.
  for (const folder of (facts.folder ?? "").split("/").filter(Boolean).reverse().slice(0, FOLDER_LEVELS)) {
    const fromFolder = kindNamed(folder);
    if (fromFolder && fromFolder !== "outline") return sure(fromFolder);
  }
  if (TEXT_EXTENSIONS.has(extension) || extension === ".docx") return guess("notes");
  if (extension === ".pdf" && facts.pages >= 4 && facts.text.trim()) {
    return guess(facts.text.length / facts.pages < SLIDE_CHARS_PER_PAGE ? "slides" : "notes");
  }
  return guess("other");
}

function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Drops brackets left without their partner once the clutter inside them was removed. */
function balanced(text: string): string {
  const stripped = text.replace(/\(\s*\)/g, " ");
  const open = (stripped.match(/\(/g) ?? []).length;
  const close = (stripped.match(/\)/g) ?? []).length;
  return tidy(open === close ? stripped : stripped.replace(/[()]/g, " "));
}

const DANGLING = /(?:[&:,(–—-]|\b(?:and|or|of|the|in|to|for|a|an|with))$/i;

/**
 * Titles a file could go by, best first: its name without the course code, the chapter number
 * and the clutter, then the first lines of its text that read like headings.
 */
export function titleCandidates(name: string, text: string, course: string | null): string[] {
  const stem = path.basename(name, path.extname(name));
  let title = stem.replace(/[_]+/g, " ").replace(/\(\d+\)/g, " ");
  if (course) {
    const [letters, digits] = course.split(" ");
    title = title.replace(new RegExp(`${letters}[ _-]?${digits}[a-z]?(?![a-z0-9])`, "ig"), " ");
  }
  for (const { pattern } of UNIT_WORDS) title = title.replace(new RegExp(`(?:^|[^a-z])(?:${pattern})[ ._#-]{0,2}\\d{1,2}(?!\\d)`, "ig"), " ");
  title = tidy(title.replace(/[-–—:.,]+/g, " ").replace(/\b(slides?|lecture|recording)\b/gi, " ").replace(/\s+(final|draft|copy|v\d+)$/i, ""));
  title = balanced(title);
  const fromName = title.length >= 4 && /[a-z]{3}/i.test(title) ? [title.slice(0, MAX_TITLE)] : [];
  // "BUS 100: Motivation" and "3 Workplace Laws" both carry a label in front of the topic.
  const withoutCode = (line: string) => tidy(tidy(line).replace(/^[A-Z]{3,4}[ \u00a0]?\d{3}[A-Z]?\b\s*[:–—-]?\s*/, "").replace(/^(?:week|chapter|lecture|topic)?\s*\d{1,2}\s*[:–—-]?\s+(?=[A-Za-z])/i, ""));
  const headings = text.split("\n").slice(0, 40).filter((line) => !/^\s*\d+[.)]/.test(line)).map(withoutCode)
    .filter((line) => line.length >= 6 && line.length <= MAX_TITLE && /[a-z]{4}/i.test(line) && line.split(" ").length >= 2 && !DANGLING.test(line) && !/[.;]$/.test(line))
    .slice(0, 4);
  return [...new Set([...fromName, ...headings, tidy(stem.replace(/[_-]+/g, " ")).slice(0, MAX_TITLE)])];
}

/** The best title, passing over any in `taken` (titles other units of the course already go by). */
export function titleOf(name: string, text: string, course: string | null, taken: string[] = []): string {
  const candidates = titleCandidates(name, text, course);
  const used = new Set(taken.map((title) => title.toLowerCase()));
  return candidates.find((candidate) => !used.has(candidate.toLowerCase())) ?? candidates[0];
}

/**
 * Tags one file. `takenTitles` says which titles the course's other units already use, so a
 * line printed on every deck (the course's name) is not taken for each one's topic.
 */
export function tagFile(facts: FileFacts, knownCourses: string[] = [], takenTitles: (course: string | null, unit: UnitTag | null) => string[] = () => []): Tags {
  const course = courseOf(facts.name, facts.text, knownCourses, facts.folder);
  const { kind, sure } = kindOf(facts);
  const unit = unitOf(facts.name, facts.text, facts.pages);
  return { course, kind, kindSure: sure, unit, title: titleOf(facts.name, facts.text, course, takenTitles(course, unit)) };
}

/** Lays a typed course code out the standard way ("fin101" → "FIN 101"); null when it is not one. */
export function cleanCourse(typed: string): string | null {
  const match = typed.trim().match(/^([a-z]{2,5})[ _-]?(\d{2,4}[a-z]?)$/i);
  return match ? `${match[1].toUpperCase()} ${match[2].toUpperCase()}` : null;
}
