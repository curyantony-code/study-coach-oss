// Reads the "assigned problems" list from a course outline and matches it to the worked
// problems written up in a vault.
import type { Card, Node } from "../vault/types";

export type ProblemKind = "P" | "CFA";

export interface ProblemRef {
  chapter: number;
  kind: ProblemKind;
  number: number;
}

export interface OutlineItem extends ProblemRef {
  /** Sub-parts named in the outline, e.g. ["c", "d"] for "CFA 6 (c and d)". */
  parts: string[];
}

export interface OutlineChapter {
  chapter: number;
  items: OutlineItem[];
}

const CHAPTER_LINE = /chapter\s+(\d+)\s*[:–—-]\s*(.+)$/i;
const NUMBER_TOKEN = /(\d+)\s*(?:to|–|—|-)\s*(\d+)|(\d+)\s*(?:\(([^)]*)\))?/g;
/** Longest run of problems a single "a to b" may expand to; anything longer is not a problem list. */
const MAX_RANGE = 60;

function itemsIn(group: string, chapter: number): OutlineItem[] {
  const kind: ProblemKind = /\bCFA\b/i.test(group) ? "CFA" : "P";
  const items: OutlineItem[] = [];
  // "P10 to P16" is the same as "10 to 16".
  for (const match of group.replace(/\bP(?=\d)/gi, "").matchAll(NUMBER_TOKEN)) {
    if (match[1] && match[2]) {
      const [from, to] = [Number(match[1]), Number(match[2])];
      if (to < from || to - from > MAX_RANGE) continue;
      for (let number = from; number <= to; number++) items.push({ chapter, kind, number, parts: [] });
    } else if (match[3]) {
      const parts = (match[4] ?? "").split(/,|\band\b|\s+/i).map((p) => p.trim().toLowerCase()).filter((p) => /^[a-z]$/.test(p));
      items.push({ chapter, kind, number: Number(match[3]), parts });
    }
  }
  return items;
}

/**
 * Parses outline lines such as
 *   "Chapter 14: 3, 6, 8; CFA problems 2, 6 (c and d)"
 *   "* Chapter 6: 4 to 6, 13 to 19; CFA problems 1 to 3"
 * Lines that do not start with a chapter are ignored. Chapters keep the outline's order.
 */
export function parseOutline(text: string): OutlineChapter[] {
  const chapters = new Map<number, OutlineItem[]>();
  for (const line of text.split("\n")) {
    const match = line.match(CHAPTER_LINE);
    if (!match) continue;
    const chapter = Number(match[1]);
    const items = match[2].split(";").flatMap((group) => itemsIn(group, chapter));
    const seen = new Set((chapters.get(chapter) ?? []).map(refKey));
    const fresh = items.filter((item) => !seen.has(refKey(item)) && seen.add(refKey(item)));
    chapters.set(chapter, [...(chapters.get(chapter) ?? []), ...fresh]);
  }
  return [...chapters.entries()].filter(([, items]) => items.length > 0).map(([chapter, items]) => ({ chapter, items }));
}

export function refKey(ref: ProblemRef): string {
  return `ch${ref.chapter}-${ref.kind.toLowerCase()}${ref.number}`;
}

export function itemLabel(item: Pick<OutlineItem, "kind" | "number" | "parts">): string {
  const parts = item.parts.length > 0 ? ` (${item.parts.join(", ")})` : "";
  return `${item.kind === "CFA" ? "CFA" : "Problem"} ${item.number}${parts}`;
}

export interface ParsedHeading {
  chapter: number;
  refs: ProblemRef[];
  title: string;
}

const HEADING_PREFIX = /^Ch(?:apter)?\s*(\d+)\s*[-–—:]\s*(.*)$/i;

/**
 * Reads which problems a write-up covers from its heading:
 *   "Ch7-CFA5 Diversification Statement"      → chapter 7, CFA 5
 *   "Ch9-P10 to P16 Which Situations…"         → chapter 9, problems 10–16
 *   "Ch10-CFA3 CFA4 CFA6 CFA8 Conceptual"      → chapter 10, CFA 3, 4, 6, 8
 *   "Ch14-CFA6c and 6d Discount Bond…"         → chapter 14, CFA 6
 * Returns null for headings that do not name a chapter (lecture examples and the like).
 */
export function parseProblemHeading(heading: string): ParsedHeading | null {
  const prefix = heading.match(HEADING_PREFIX);
  if (!prefix) return null;
  const chapter = Number(prefix[1]);
  // "CFA 3" and "Problem 5" are read like "CFA3" and "P5".
  const words = prefix[2].replace(/\b(CFA|P|Problems?)\s+(?=\d)/gi, (_, label: string) => (/^cfa$/i.test(label) ? "CFA" : "P")).split(/\s+/);
  const refs: ProblemRef[] = [];
  let kind: ProblemKind | null = null;
  let connector: "to" | "and" | null = null;
  let used = 0;

  for (const word of words) {
    const listed = word.endsWith(",");
    const token = word.replace(/,$/, "");
    const named = token.match(/^(P|CFA)(\d+)[a-z]?$/i);
    // A bare number continues the list only right after "to", "and" or a comma: "6d" in
    // "CFA6c and 6d" is a problem, the "2" in "P5 2 Year Bond" is part of the title.
    const bare = connector ? token.match(/^(\d+)[a-z]?$/) : null;
    if (/^(to|and|&)$/i.test(token) && refs.length > 0) {
      connector = /^to$/i.test(token) ? "to" : "and";
    } else if (named || (bare && kind)) {
      kind = named ? (named[1].toUpperCase() as ProblemKind) : kind!;
      const number = Number(named ? named[2] : bare![1]);
      const previous = refs[refs.length - 1]?.number ?? number;
      const isRange = connector === "to" && number > previous && number - previous <= MAX_RANGE;
      for (let n = isRange ? previous + 1 : number; n <= number; n++) refs.push({ chapter, kind, number: n });
      connector = listed ? "and" : null;
    } else {
      break;
    }
    used++;
  }
  if (refs.length === 0) return null;
  // A trailing connector belongs to the title ("… and Price Path"), not to the list of numbers.
  while (used > 0 && /^(to|and|&)$/i.test(words[used - 1])) used--;
  const unique = [...new Map(refs.map((r) => [refKey(r), r])).values()];
  return { chapter, refs: unique, title: words.slice(used).join(" ").trim() };
}

/** One worked problem found in the vault. */
export interface WrittenProblem {
  card: Card;
  nodeTitle: string;
  /** Null when the heading names no chapter. */
  parsed: ParsedHeading | null;
}

export interface ProblemEntry {
  key: string;
  label: string;
  /** The write-up that answers this entry, or null when the notes have none yet. */
  problem: WrittenProblem | null;
  /** Other outline entries answered by the same write-up, e.g. "Problems 10–16 share one write-up". */
  sharedWith: number;
}

export interface ProblemSection {
  id: string;
  title: string;
  entries: ProblemEntry[];
}

export interface ProblemSet {
  /** True when the sections follow a saved course outline rather than just the headings in the notes. */
  fromOutline: boolean;
  sections: ProblemSection[];
  /** Every write-up once, in the order a student would work through them. */
  order: WrittenProblem[];
}

export function findProblems(cards: Card[], nodes: Node[]): WrittenProblem[] {
  const titles = new Map(nodes.map((n) => [n.id, n.title]));
  return cards
    .filter((c) => c.type === "problem" && c.problem)
    .map((card) => ({ card, nodeTitle: titles.get(card.nodeId) ?? card.nodeId, parsed: parseProblemHeading(card.problem!.heading) }));
}

function byRef(a: ProblemRef, b: ProblemRef): number {
  return a.chapter - b.chapter || (a.kind === b.kind ? 0 : a.kind === "P" ? -1 : 1) || a.number - b.number;
}

function refsLabel(refs: ProblemRef[]): string {
  const kinds: ProblemKind[] = ["P", "CFA"];
  return kinds
    .map((kind) => {
      const numbers = refs.filter((r) => r.kind === kind).map((r) => r.number);
      if (numbers.length === 0) return "";
      const consecutive = numbers.length > 2 && numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
      const list = consecutive ? `${numbers[0]}–${numbers[numbers.length - 1]}` : numbers.join(", ");
      return `${kind === "CFA" ? "CFA" : numbers.length > 1 ? "Problems" : "Problem"} ${list}`;
    })
    .filter(Boolean)
    .join(", ");
}

function otherSection(problems: WrittenProblem[], title: string): ProblemSection | null {
  if (problems.length === 0) return null;
  return {
    id: "other",
    title,
    entries: problems.map((problem) => ({ key: problem.card.id, label: problem.card.problem!.heading, problem, sharedWith: 0 })),
  };
}

const TOPIC_EXAMPLE = /^T(?:opic)?\s*(\d+)\s*[-–,]?\s*L(?:ecture)?\s*(\d+)\s*[-–—:]\s*(.*)$/i;

/** "FIN 201 - Topic 05 - Capital Structure" → "Capital Structure". */
function noteName(title: string): string {
  const parts = title.split(/\s+[-–—]\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : title;
}

/**
 * Worked examples whose headings name no textbook chapter. "T2 L3 - MMCC Bowling Ball" is
 * lecture example 3 of topic 2; anything else is grouped under the note it was written in,
 * so a course's examples are never one long undivided list.
 */
function exampleSections(problems: WrittenProblem[]): ProblemSection[] {
  const topics = new Map<number, { number: number; title: string; problem: WrittenProblem }[]>();
  const byNote = new Map<string, WrittenProblem[]>();
  for (const problem of problems) {
    const match = problem.card.problem!.heading.match(TOPIC_EXAMPLE);
    if (match) {
      const topic = Number(match[1]);
      topics.set(topic, [...(topics.get(topic) ?? []), { number: Number(match[2]), title: match[3].trim(), problem }]);
    } else {
      byNote.set(problem.nodeTitle, [...(byNote.get(problem.nodeTitle) ?? []), problem]);
    }
  }
  const topicSections = [...topics.entries()]
    .sort(([a], [b]) => a - b)
    .map(([topic, examples]) => ({
      id: `topic${topic}`,
      title: `Topic ${topic}: lecture examples`,
      entries: examples
        .sort((a, b) => a.number - b.number)
        .map(({ number, title, problem }) => ({ key: problem.card.id, label: `Example ${number}${title ? `: ${title}` : ""}`, problem, sharedWith: 0 })),
    }));
  // One note's worth of examples keeps the plain title; several notes each get their own section.
  if (byNote.size <= 1 && topicSections.length === 0) {
    const only = otherSection([...byNote.values()].flat(), "Other worked examples");
    return only ? [only] : [];
  }
  const noteSections = [...byNote.entries()].map(([nodeTitle, list], i) => ({
    id: `examples${i + 1}`,
    title: `${noteName(nodeTitle)}: worked examples`,
    entries: list.map((problem) => ({ key: problem.card.id, label: problem.card.problem!.heading, problem, sharedWith: 0 })),
  }));
  return [...topicSections, ...noteSections];
}

/**
 * Lays the vault's worked problems out chapter by chapter. With an outline, every assigned
 * problem is listed (including ones the notes have not written up yet); without one, the
 * chapters come from the problem headings.
 */
export function buildProblemSet(problems: WrittenProblem[], outline: OutlineChapter[] | null): ProblemSet {
  const withChapter = problems.filter((p) => p.parsed !== null);
  const without = problems.filter((p) => p.parsed === null);
  const covering = new Map<string, WrittenProblem>();
  for (const problem of withChapter) {
    for (const ref of problem.parsed!.refs) if (!covering.has(refKey(ref))) covering.set(refKey(ref), problem);
  }

  let sections: ProblemSection[];
  const used = new Set<string>();
  if (outline && outline.length > 0) {
    sections = outline.map(({ chapter, items }) => {
      const matched = items.map((item) => ({ item, problem: covering.get(refKey(item)) ?? null }));
      return {
        id: `ch${chapter}`,
        title: `Chapter ${chapter}`,
        entries: matched.map(({ item, problem }) => {
          if (problem) used.add(problem.card.id);
          const sharedWith = problem ? matched.filter((m) => m.problem?.card.id === problem.card.id).length - 1 : 0;
          return { key: refKey(item), label: itemLabel(item), problem, sharedWith };
        }),
      };
    });
  } else {
    const chapters = [...new Set(withChapter.map((p) => p.parsed!.chapter))].sort((a, b) => a - b);
    sections = chapters.map((chapter) => ({
      id: `ch${chapter}`,
      title: `Chapter ${chapter}`,
      entries: withChapter
        .filter((p) => p.parsed!.chapter === chapter)
        .sort((a, b) => byRef(a.parsed!.refs[0], b.parsed!.refs[0]))
        .map((problem) => {
          used.add(problem.card.id);
          return { key: problem.card.id, label: refsLabel(problem.parsed!.refs), problem, sharedWith: 0 };
        }),
    }));
  }

  // A second write-up of a problem the outline does list is still "in the outline".
  const outlineKeys = new Set((outline ?? []).flatMap((c) => c.items.map(refKey)));
  const isAssigned = (p: WrittenProblem) => used.has(p.card.id) || p.parsed!.refs.some((r) => outlineKeys.has(refKey(r)));
  const notAssigned = otherSection(withChapter.filter((p) => !isAssigned(p)), "In your notes, not in the outline");
  const all = [...sections, ...(notAssigned ? [{ ...notAssigned, id: "unassigned" }] : []), ...exampleSections(without)];

  const order: WrittenProblem[] = [];
  const placed = new Set<string>();
  for (const entry of all.flatMap((s) => s.entries)) {
    if (entry.problem && !placed.has(entry.problem.card.id)) {
      placed.add(entry.problem.card.id);
      order.push(entry.problem);
    }
  }
  return { fromOutline: Boolean(outline && outline.length > 0), sections: all, order };
}

export type ProblemStatus = "new" | "got" | "missed";

/** How the most recent attempt at each card went. */
export function latestResults(attempts: { cardId: string; correct: boolean }[]): Map<string, ProblemStatus> {
  const results = new Map<string, ProblemStatus>();
  for (const attempt of attempts) results.set(attempt.cardId, attempt.correct ? "got" : "missed");
  return results;
}
