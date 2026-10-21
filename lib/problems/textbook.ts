// Reads the original question text out of a textbook's "problem sets" PDF (after it has been
// converted to plain text with its layout kept), so the app can show the full wording of a
// problem that the student's notes only summarise.
//
// Expected shape, chapter after chapter:
//   …numbered problems ("1. …", "2. …")…  then, restarting at 1, the CFA problems
//   E-INVESTMENTS EXERCISES
//   SOLUTIONS TO CONCEPT CHECKS  (numbered answers; not problems)
import type { ProblemKind } from "./outline";

export interface TextbookProblem {
  chapter: number;
  kind: ProblemKind;
  number: number;
  /** The question as printed, wrapped lines rejoined. */
  text: string;
  /** Shared set-up printed before a group of problems ("The following data apply to Problems 4 through 10: …"). */
  preamble: string | null;
}

const SECTION_END = /E-INVESTMENTS EXERCISE|SOLUTIONS TO CONCEPT CHECK/;
const CHAPTER_END = /SOLUTIONS TO CONCEPT CHECK/;
const NUMBERED = /^(?:PROBLEM SETS)?\s{0,30}(\d{1,2})\.\s+\S/;
const MARGIN_LABEL = /\s{3,}(?:PROB|LEM SETS|PROBLEM SETS)\s*$/;
const PAGE_FURNITURE = [
  /^\s*\d+\s+PART\s+[IVX]+\b.*$/, // "224   PART II   Portfolio Theory and Practice"
  /^\s*CHAPTER\s+\d+\s+.*\d\s*$/, // "CHAPTER 7   Optimal Risky Portfolios   227"
  /^\s*(?:PROB|LEM SETS|PROBLEM SETS)\s*$/,
  /mhhe\.com|\.indd\b|^\s*Visit us at\b/i,
];
/** "…apply to Problems 4 through 10", "For CFA Problems 1 to 3…" */
const GROUP_RANGE = /\b(CFA\s+)?Problems?\s+(\d{1,2})\s*(?:through|to|–|—|-)\s*(\d{1,2})\b/i;
/** How a shared set-up begins: a known phrase, or any short lead-in ending "…Problems 13 through 19:". */
const GROUP_OPENING =
  /^\s*(?:The following|Use the following|For (?:CFA )?Problems?|(?:CFA )?Problems? \d|Refer to the following|Answer (?:CFA )?Problems?)\b|^\s*[A-Z][^.?!:]{0,70}\bProblems?\s+\d{1,2}\s*(?:through|to|–|—|-)\s*\d{1,2}\s*[:.]/i;
/** Zero-width and control characters that PDF extraction leaves behind. */
const INVISIBLE = /[\u0000-\u0008\u000b\u000e-\u001f​‌‍⁠﻿]/g;
/** A number missing from the extracted text (say, 13 printed inside a figure) may be skipped, up to this many in a row. */
const MAX_SKIPPED_NUMBERS = 2;
const MAX_GROUP_SPAN = 30;

function isFurniture(line: string): boolean {
  return PAGE_FURNITURE.some((pattern) => pattern.test(line));
}

function numberAt(line: string): number | null {
  const match = line.match(NUMBERED);
  return match ? Number(match[1]) : null;
}

interface Start {
  line: number;
  number: number;
}

/**
 * Where problems 1, 2, 3… start, following the numbering forward from `first`. If a number
 * never appears (the extraction lost it), the run carries on from the next one that does.
 */
function followNumbering(lines: string[], first: number, end: number): Start[] {
  const starts: Start[] = [{ line: first, number: 1 }];
  let expected = 2;
  for (let i = first + 1; i < end; i++) {
    const n = numberAt(lines[i]);
    if (n === null || n < expected || n > expected + MAX_SKIPPED_NUMBERS) continue;
    const expectedStillComing = n > expected && lines.slice(i + 1, end).some((l) => numberAt(l) === expected);
    if (expectedStillComing) continue;
    starts.push({ line: i, number: n });
    expected = n + 1;
  }
  return starts;
}

/** A table row has columns set apart by wide gaps. */
function isTableRow(line: string): boolean {
  return (line.trim().match(/\S\s{3,}\S/g) ?? []).length >= 2 || /^\s{12,}\S.*\s{3,}\S/.test(line);
}

/** Rejoins wrapped lines into sentences, keeps lettered sub-parts and table rows on their own lines. */
export function tidyProblemText(lines: string[]): string {
  const out: string[] = [];
  let previousWasTable = false;
  for (const raw of lines) {
    if (isFurniture(raw)) continue;
    const line = raw.replace(MARGIN_LABEL, "").replace(/\s+$/, "");
    const table = isTableRow(line);
    // Outside tables, runs of spaces are only extraction noise.
    const text = table ? line.trim() : line.trim().replace(/\s{2,}/g, " ");
    if (text === "") {
      previousWasTable = false;
      continue;
    }
    const startsItem = /^(?:[a-z]\.|\(?[ivx]{1,4}\)|\([a-z]\))\s/.test(text);
    if (table) {
      out.push(text.replace(/\s{2,}/g, "  |  "));
    } else if (out.length === 0 || startsItem || previousWasTable) {
      out.push(text);
    } else {
      const last = out[out.length - 1];
      // "propor-" + "tions" was one word split across lines.
      out[out.length - 1] = /[a-z]-$/.test(last) && /^[a-z]/.test(text) ? last.slice(0, -1) + text : `${last} ${text}`;
    }
    previousWasTable = table;
  }
  return out.join("\n");
}

interface Group {
  kind: ProblemKind;
  from: number;
  to: number;
  text: string;
}

/** Splits a problem's lines into the problem itself and any set-up for a later group of problems that follows it. */
function splitOffGroup(chunk: string[], currentNumber: number, section: ProblemKind): { own: string[]; group: Group | null } {
  for (let i = 1; i < chunk.length; i++) {
    if (!GROUP_OPENING.test(chunk[i])) continue;
    const rest = chunk.slice(i);
    const range = rest.slice(0, 4).join(" ").match(GROUP_RANGE);
    if (!range) continue;
    const [from, to] = [Number(range[2]), Number(range[3])];
    const isCfa = Boolean(range[1]);
    if (to < from || to - from > MAX_GROUP_SPAN || (!isCfa && from <= currentNumber)) continue;
    return { own: chunk.slice(0, i), group: { kind: isCfa ? "CFA" : section, from, to, text: tidyProblemText(rest) } };
  }
  return { own: chunk, group: null };
}

function readSection(lines: string[], starts: Start[], end: number, chapter: number, kind: ProblemKind, carried: Group[]): { problems: TextbookProblem[]; groups: Group[] } {
  const groups = [...carried];
  const problems = starts.map(({ line, number }, i) => {
    const chunk = lines.slice(line, starts[i + 1]?.line ?? end);
    const { own, group } = splitOffGroup(chunk, number, kind);
    const preamble = groups.find((g) => g.kind === kind && number >= g.from && number <= g.to)?.text ?? null;
    if (group) groups.push(group);
    const text = tidyProblemText([own[0].replace(/^(?:PROBLEM SETS)?\s*\d{1,2}\.\s+/, ""), ...own.slice(1)]);
    return { chapter, kind, number, text, preamble };
  });
  return { problems, groups };
}

function mostCommon(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function parseProblemSets(rawText: string): TextbookProblem[] {
  const lines = rawText.replace(/\f/g, "\n").replace(INVISIBLE, "").split("\n");
  const chapterEnds = lines.flatMap((line, i) => (CHAPTER_END.test(line) ? [i] : []));
  const regionStarts = [0, ...chapterEnds.map((i) => i + 1)];
  const all: TextbookProblem[] = [];
  let previousChapter = 0;
  const chaptersRead = new Set<number>();

  for (const start of regionStarts) {
    const afterStart = lines.findIndex((line, i) => i >= start && SECTION_END.test(line));
    const end = afterStart === -1 ? lines.length : afterStart;
    const headerChapters = lines.slice(start, end).flatMap((l) => {
      const m = l.match(/CHAPTER\s+(\d+)\b/);
      return m ? [Number(m[1])] : [];
    });
    const chapter = mostCommon(headerChapters) ?? previousChapter + 1;

    // Every "1." in the region could begin the problems; the real one is marked in the margin,
    // or failing that begins the longest run (answers to concept checks are a shorter run before it).
    const ones = Array.from({ length: end - start }, (_, k) => start + k).filter((i) => numberAt(lines[i]) === 1);
    if (ones.length === 0) continue;
    const marked = ones.find((i) => /PROB/.test(lines[i]));
    // Neither a margin label nor a chapter header: these are leftover answers, not a problem set.
    if (marked === undefined && headerChapters.length === 0) continue;
    const first = marked ?? ones.map((i) => ({ i, length: followNumbering(lines, i, end).length })).sort((a, b) => b.length - a.length || a.i - b.i)[0].i;
    // Two regions claiming one chapter cannot both be right, and a later one must never
    // quietly replace the first: its problems would show under the wrong numbers.
    if (chaptersRead.has(chapter)) continue;
    chaptersRead.add(chapter);
    const problemStarts = followNumbering(lines, first, end);
    const lastStart = problemStarts[problemStarts.length - 1].line;
    // The CFA problems restart at 1 after the last numbered problem.
    const cfaFirst = ones.find((i) => i > lastStart);
    const main = readSection(lines, problemStarts, cfaFirst ?? end, chapter, "P", []);
    all.push(...main.problems);
    if (cfaFirst !== undefined) {
      all.push(...readSection(lines, followNumbering(lines, cfaFirst, end), end, chapter, "CFA", main.groups).problems);
    }
    previousChapter = chapter;
  }
  return all.filter((p) => p.text.length > 0);
}

export function textbookKey(problem: Pick<TextbookProblem, "chapter" | "kind" | "number">): string {
  return `ch${problem.chapter}-${problem.kind.toLowerCase()}${problem.number}`;
}
