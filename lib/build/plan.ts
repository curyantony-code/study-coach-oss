// Lays out a new vault for one course from its tagged files: where each original goes under
// raw/, which notes are written under wiki/, and the study.yml that ties them together.
// Pure: it decides, lib/build/write.ts does the writing.
import path from "path";
import { manifestToYaml, type Manifest } from "../vault/manifest";
import { documentToMarkdown, pagesToMarkdown, splitFrontmatter } from "./notes";
import { KIND_LABELS, type Kind, type UnitTag } from "./tags";

export interface BuildFile {
  id: string;
  name: string;
  kind: Kind;
  unit: UnitTag | null;
  title: string;
  /** The file's text, page by page; empty when it could not be read. */
  pages: string[];
}

export interface PlannedNote {
  /** Vault-relative path, forward slashes. */
  path: string;
  content: string;
  fromFile: string;
}

export interface PlannedCopy {
  id: string;
  /** Vault-relative path under raw/. */
  to: string;
}

export interface CoursePlan {
  course: string;
  courseName: string;
  manifest: string;
  units: { id: string; label: string; notes: number }[];
  notes: PlannedNote[];
  copies: PlannedCopy[];
}

const RAW_FOLDERS: Record<Kind, string> = {
  outline: "raw/Course Info",
  slides: "raw/Slides",
  notes: "raw/Notes",
  textbook: "raw/Textbook",
  problems: "raw/Practice & Solutions",
  solutions: "raw/Practice & Solutions",
  exam: "raw/Past Exams",
  other: "raw/Other",
};
/** Kinds whose text becomes a study note. Books, problem sets and exams stay as files. */
const NOTE_KINDS = new Set<Kind>(["slides", "notes"]);
const GENERAL: UnitTag = { key: "general", label: "General" };
const MAX_NAME = 120;
const MAX_NAME_BYTES = 180;
/** Names Windows keeps for itself, with or without an extension. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
const TERM = /\b(Fall|Winter|Spring|Summer|Autumn)\s+(20\d{2})\b/i;

/** A name that is safe as a file or folder name on Mac and Windows, and inside an Obsidian link. */
export function safeName(text: string): string {
  const trimmed = (value: string) => value.replace(/^[. ]+|[. ]+$/g, "");
  // One spelling per name: an accent typed two ways would otherwise be two names on some disks and one on others.
  let cleaned = trimmed(text.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ")).slice(0, MAX_NAME);
  // File names are limited in bytes, not letters.
  while (Buffer.byteLength(cleaned) > MAX_NAME_BYTES) cleaned = cleaned.slice(0, -1);
  cleaned = trimmed(cleaned);
  if (!cleaned) return "Untitled";
  return WINDOWS_RESERVED.test(cleaned) ? `${cleaned} file` : cleaned;
}

/** Gives every path a name of its own: the second "Notes.md" becomes "Notes (2).md". */
function unique(used: Set<string>, wanted: string): string {
  const extension = path.posix.extname(wanted);
  const base = wanted.slice(0, wanted.length - extension.length);
  const key = (name: string) => name.normalize("NFC").toLowerCase();
  let candidate = wanted;
  for (let n = 2; used.has(key(candidate)); n++) candidate = `${base} (${n})${extension}`;
  used.add(key(candidate));
  return candidate;
}

function titleCase(text: string): string {
  return text === text.toUpperCase() ? text.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()).replace(/\b(And|Of|In|The|To|For)\b/g, (word, at: number) => (at === 0 ? word : word.toLowerCase())) : text;
}

function plausibleName(text: string | undefined): string | null {
  const name = text?.replace(/\s{2,}.*$/, "").replace(/[\s,;:(–—-]+$/, "").trim();
  return name && name.length >= 4 && name.length <= 70 && /[a-z]{3}/i.test(name) && !/\d{3}|[:@]/.test(name) ? titleCase(name) : null;
}

/**
 * The course's full name as its outline gives it, else null. Outlines say it three ways: a
 * "Course Name:" line, on the code's own line ("FIN 101 – Introduction to Finance"), or as the
 * title line just above the code.
 */
export function courseNameIn(outlineText: string, course: string): string | null {
  const head = outlineText.slice(0, 8000);
  const [letters, digits] = course.split(" ");
  const code = `${letters}[ \\u00a0]?${digits}[A-Z]?`;
  const labelled = plausibleName(head.match(/^\s*Course (?:Name|Title)\s*:?[ \t]+(\S[^\n]*)$/im)?.[1]);
  if (labelled) return labelled;
  const sameLine = plausibleName(head.match(new RegExp(`${code}(?:[ /]+[A-Z]{1,3}\\b)?\\s*[:–—-]\\s*([A-Za-z][^\\n]{3,70})`))?.[1]);
  if (sameLine) return sameLine;
  const lines = head.split("\n").map((line) => line.trim()).filter(Boolean);
  const at = lines.findIndex((line) => new RegExp(`^${code}\\b`).test(line));
  const above = at > 0 ? plausibleName(lines[at - 1]) : null;
  return above && above.split(" ").length <= 8 && !/school|department|university|faculty|college/i.test(above) ? above : null;
}

function byUnit(a: UnitTag, b: UnitTag): number {
  if (a.key === GENERAL.key || b.key === GENERAL.key) return Number(a.key === GENERAL.key) - Number(b.key === GENERAL.key);
  return a.key.localeCompare(b.key, undefined, { numeric: true });
}

function rawName(file: BuildFile, course: string): string {
  const extension = path.extname(file.name);
  const stem = safeName(path.basename(file.name, extension));
  // The Schedule and Problems pages find these files by a word in their name.
  if (file.kind === "outline" && !/outline|syllabus/i.test(stem)) return `${course} - Course Outline - ${stem}${extension}`;
  if (file.kind === "problems" && !/problem|exercise|question/i.test(stem)) return `Problem Set - ${stem}${extension}`;
  return `${stem}${extension}`;
}

function quoted(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** A properties block without the given keys, each dropped together with the indented lines under it. */
export function withoutKeys(frontmatter: string, keys: string[]): string[] {
  const dropped = new RegExp(`^(?:${keys.join("|")})\\s*:`, "i");
  const kept: string[] = [];
  let dropping = false;
  for (const line of frontmatter.split("\n")) {
    const topLevel = /^\S/.test(line);
    if (topLevel) dropping = dropped.test(line);
    if (!dropping && line.trim()) kept.push(line);
  }
  return kept;
}

function noteBody(file: BuildFile): { frontmatter: string; body: string } {
  const extension = path.extname(file.name).toLowerCase();
  if (extension === ".md" || extension === ".markdown") return splitFrontmatter(file.pages.join("\n"));
  if (file.pages.length > 1 || extension === ".pdf" || extension === ".pptx") {
    return { frontmatter: "", body: pagesToMarkdown(file.pages, extension === ".pptx" || file.kind === "slides" ? "Slide" : "Page") };
  }
  return { frontmatter: "", body: documentToMarkdown(file.pages.join("\n\n")) };
}

function noteContent(file: BuildFile, course: string, unit: UnitTag, heading: string, rawPath: string): string {
  const { frontmatter, body } = noteBody(file);
  const tag = course.replace(/\s+/g, "").toLowerCase();
  // A note the student wrote keeps its own properties; only what the app needs is added.
  const kept = withoutKeys(frontmatter, ["units", "title", "source"]);
  const properties = [
    `title: ${quoted(heading)}`,
    `units: [${quoted(unit.key)}]`,
    ...(kept.some((line) => /^tags:/i.test(line)) ? [] : [`tags: [${tag}, ${file.kind}]`]),
    `source: ${quoted(rawPath)}`,
    ...kept,
  ];
  const ownTitle = /^#\s+\S/m.test(body.slice(0, 300));
  return [
    "---", ...properties, "---", "",
    ...(ownTitle ? [] : [`# ${heading}`, ""]),
    ...(/^\.(md|markdown)$/i.test(path.extname(file.name)) ? [] : [`*Made by Study Coach from ${file.name}: the text as it was read from the file.*`, ""]),
    body.trim(), "",
  ].join("\n");
}

function sourcesHub(course: string, rows: { file: string; kind: Kind; unit: string; note: string | null }[]): string {
  // The first column is headed "File" so this table is not turned into flashcards.
  return [
    "---", `title: ${quoted(`${course} - Sources`)}`, "---", "", `# ${course} - Sources`, "",
    "Every file this course was built from, and where it went.", "",
    "| File | Kind | Unit | Note |", "|---|---|---|---|",
    ...rows.map((row) => `| ${row.file.replace(/\|/g, "/")} | ${KIND_LABELS[row.kind]} | ${row.unit.replace(/\|/g, "/")} | ${row.note ? `[[${row.note}]]` : "kept as a file"} |`),
    "",
  ].join("\n");
}

/** The whole layout of one course's vault. `outlineText` is the outline's text, when there is one. */
export function planCourse(course: string, files: BuildFile[], outlineText = ""): CoursePlan {
  const usedRaw = new Set<string>();
  const usedNotes = new Set<string>();
  const sorted = [...files].sort((a, b) => byUnit(a.unit ?? GENERAL, b.unit ?? GENERAL) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const copies = new Map(sorted.map((file) => [file.id, unique(usedRaw, `${RAW_FOLDERS[file.kind]}/${rawName(file, course)}`)]));

  // The same slides saved as PowerPoint and as PDF make one note, from the PowerPoint.
  const stem = (file: BuildFile) => path.basename(file.name, path.extname(file.name)).toLowerCase();
  const decks = new Set(sorted.filter((file) => /\.pptx$/i.test(file.name) && file.pages.some((page) => page.trim())).map(stem));
  const noteFiles = sorted.filter((file) => NOTE_KINDS.has(file.kind) && file.pages.some((page) => page.trim()) && !(/\.pdf$/i.test(file.name) && decks.has(stem(file))));
  const unitTags = [...new Map(noteFiles.map((file) => [(file.unit ?? GENERAL).key, file.unit ?? GENERAL])).values()].sort(byUnit);
  // A unit with one clear subject carries it in its name: "Chapter 7 - Optimal Risky Portfolios".
  // A title that several units share is the course's name, not a subject: it is left out.
  const unitsUsing = new Map<string, Set<string>>();
  for (const file of noteFiles) {
    const title = file.title.toLowerCase();
    unitsUsing.set(title, (unitsUsing.get(title) ?? new Set()).add((file.unit ?? GENERAL).key));
  }
  const isSubject = (title: string) => (unitsUsing.get(title.toLowerCase())?.size ?? 0) <= 1;
  const unitLabel = (unit: UnitTag) => {
    const titles = [...new Set(noteFiles.filter((file) => (file.unit ?? GENERAL).key === unit.key).map((file) => file.title))];
    const named = unit.key !== GENERAL.key && titles.length === 1 && isSubject(titles[0]) && titles[0].toLowerCase() !== unit.label.toLowerCase();
    return named ? `${unit.label} - ${titles[0]}` : unit.label;
  };

  const notes = noteFiles.map((file): PlannedNote => {
    const unit = file.unit ?? GENERAL;
    const heading = unit.key === GENERAL.key ? `${course} - ${file.title}` : isSubject(file.title) ? `${course} - ${unit.label} - ${file.title}` : `${course} - ${unit.label}`;
    const notePath = unique(usedNotes, `wiki/${safeName(unitLabel(unit))}/${safeName(heading)}.md`);
    return { path: notePath, content: noteContent(file, course, unit, heading, copies.get(file.id)!), fromFile: file.id };
  });

  const noteOf = new Map(notes.map((note) => [note.fromFile, path.posix.basename(note.path, ".md")]));
  // Beside wiki/, not in it: a list of files is for the student to look things up, not to study.
  const hubPath = `${safeName(`${course} - Sources`)}.md`;
  const hub = sourcesHub(course, sorted.map((file) => ({ file: file.name, kind: file.kind, unit: file.unit?.label ?? "", note: noteOf.get(file.id) ?? null })));

  const courseName = courseNameIn(outlineText, course) ?? course;
  const term = outlineText.slice(0, 8000).match(TERM);
  // Only a whole book is named as the textbook, not one chapter out of many.
  const books = sorted.filter((file) => file.kind === "textbook");
  const textbook = books.find((file) => /edition|\b\d+(?:st|nd|rd|th)? ?c?ed?\b/i.test(file.name)) ?? (books.length === 1 ? books[0] : undefined);
  const manifest: Manifest = {
    course: {
      name: courseName,
      code: course,
      ...(term ? { term: `${term[1][0].toUpperCase()}${term[1].slice(1).toLowerCase()} ${term[2]}` } : {}),
      // Downloaded books carry authors, publisher and codes after the title: the title is enough.
      ...(textbook ? { textbook: safeName(path.basename(textbook.name, path.extname(textbook.name)).split(/\s--\s|,? by /i)[0].replace(/^[\s-]+/, "")).slice(0, 100) } : {}),
    },
    content: { include: ["wiki/**"], exclude: ["raw/**", "_study-drafts/**"] },
    units: unitTags.map((unit) => ({ id: unit.key, label: unitLabel(unit), aliases: [] })),
    assessments: [],
    cards: { kind: "conceptual" },
  };
  const header = [
    "# study.yml: tells Study Coach how this course is organised.",
    "# Written when the course was built from your files. Test dates are read from the course",
    "# outline in raw/Course Info, so none are listed here.",
    "",
  ].join("\n");

  return {
    course,
    courseName,
    manifest: header + manifestToYaml(manifest),
    units: unitTags.map((unit) => ({ id: unit.key, label: unitLabel(unit), notes: noteFiles.filter((file) => (file.unit ?? GENERAL).key === unit.key).length })),
    notes: [...notes, { path: hubPath, content: hub, fromFile: "" }],
    copies: [...copies].map(([id, to]) => ({ id, to })),
  };
}
