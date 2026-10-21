// Replaces a worked problem's summary (as written in the notes) with the textbook's full
// wording, when the vault's problem-set PDF has been imported.
import { significantWords } from "../videos/topic";
import type { Card } from "../vault/types";
import { parseProblemHeading, type ProblemKind, type ProblemRef } from "./outline";
import { textbookKey, type TextbookProblem } from "./textbook";

/** Below this share of the note's own words, the textbook text may be a different problem. */
const MIN_SHARED_WORDS = 0.25;
const MIN_WORDS_TO_JUDGE = 4;

/**
 * Edition differences noted on a problem, e.g. "Canadian 4 = US 5" or "Canadian CFA 1 = US CFA 2":
 * how far the textbook file's numbering is from the heading's, per kind of problem.
 */
export function editionOffsets(note: string | null): Partial<Record<ProblemKind, number>> {
  const offsets: Partial<Record<ProblemKind, number>> = {};
  if (!note) return offsets;
  for (const match of note.matchAll(/Canadian\s+(CFA\s+)?(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s*=\s*US\s+(?:CFA\s+)?(\d{1,2})/gi)) {
    offsets[match[1] ? "CFA" : "P"] = Number(match[3]) - Number(match[2]);
  }
  return offsets;
}

function escapeDollars(text: string): string {
  // Textbook text is plain: a dollar sign is money, never the start of a formula.
  return text.replace(/\$/g, "\\$");
}

function label(ref: ProblemRef): string {
  return `${ref.kind === "CFA" ? "CFA " : ""}Problem ${ref.number}`;
}

function sharedWordShare(noteVersion: string, original: string): number | null {
  const noteWords = [...new Set(significantWords(noteVersion.replace(/\$[^$\n]*\$/g, " ")))];
  if (noteWords.length < MIN_WORDS_TO_JUDGE) return null;
  const originalWords = new Set(significantWords(original));
  return noteWords.filter((w) => originalWords.has(w)).length / noteWords.length;
}

export interface OriginalsSource {
  /** File name shown as the source. */
  fileName: string;
  problems: Map<string, TextbookProblem>;
}

/**
 * "Canadian 9" with no "= US …" marks a problem that exists only in the course's own edition:
 * the textbook file's problem with that number would be a different question.
 */
export function isOwnEditionOnly(note: string | null): boolean {
  return note !== null && /\bCanadian\b/i.test(note) && /\d/.test(note) && !/\bUS\b/.test(note) && !/\b(inputs?|numbers?|data)\b/i.test(note);
}

/** The full wording for one problem card, or null when the textbook file does not have it. */
export function originalFor(card: Card, source: OriginalsSource): { text: string; source: string; uncertain: boolean } | null {
  const parsed = card.problem ? parseProblemHeading(card.problem.heading) : null;
  if (!card.problem || !parsed || isOwnEditionOnly(card.problem.note)) return null;
  const offsets = editionOffsets(card.problem.note);
  // An edition equation we cannot read ("US 5 = Canadian 4") must not fall back to the same number.
  if (Object.keys(offsets).length === 0 && /=/.test(card.problem.note ?? "") && /\bUS\b/.test(card.problem.note ?? "")) return null;
  const found = parsed.refs
    .map((ref) => {
      const inFile = { ...ref, number: ref.number + (offsets[ref.kind] ?? 0) };
      return { ref, inFile, problem: source.problems.get(textbookKey(inFile)) };
    })
    .filter((f): f is typeof f & { problem: TextbookProblem } => f.problem !== undefined);
  if (found.length === 0) return null;

  // Shared set-up is printed once, above the questions that use it.
  const preambles = [...new Set(found.map((f) => f.problem.preamble).filter((p): p is string => p !== null))];
  const questions = found.map((f) => (found.length > 1 ? `${label(f.inFile)}. ${f.problem.text}` : f.problem.text));
  const text = escapeDollars([...preambles, ...questions].join("\n\n"));

  const where = found.length === 1 ? label(found[0].inFile) : `${label(found[0].inFile)} to ${found[found.length - 1].inFile.number}`;
  const share = card.front === card.problem.heading ? null : sharedWordShare(card.front, text);
  return { text, source: `${source.fileName} · Chapter ${parsed.chapter}, ${where}`, uncertain: found.length < parsed.refs.length || (share !== null && share < MIN_SHARED_WORDS) };
}

/** Swaps in the full wording on every problem card that has one. Other cards are returned as they are. */
export function withOriginalQuestions(cards: Card[], source: OriginalsSource | null): Card[] {
  if (!source || source.problems.size === 0) return cards;
  return cards.map((card) => {
    if (card.type !== "problem" || !card.problem) return card;
    const original = originalFor(card, source);
    if (!original) return card;
    return {
      ...card,
      front: original.text,
      problem: { ...card.problem, original: { source: original.source, noteVersion: card.front, uncertain: original.uncertain } },
    };
  });
}
