import type { QueueReason } from "./queue";

export type SessionMode = "smart" | "flashcards" | "quiz";
/** How one card is asked: guess before seeing it, recall from memory, or pick from options. */
export type AskKind = "guess" | "recall" | "choice";

export const SESSION_MODES: readonly SessionMode[] = ["smart", "flashcards", "quiz"];
/** Multiple choice needs this many wrong options to be worth asking. */
export const DISTRACTOR_COUNT = 3;
/** The Smart session moves at most this share of a session toward the student's best mode. */
export const BEST_MODE_SHARE = 0.3;

export function parseSessionMode(text: string | null | undefined): SessionMode {
  return SESSION_MODES.includes(text as SessionMode) ? (text as SessionMode) : "smart";
}

export interface PlanItem {
  reason: QueueReason;
  /** A worked problem is solved, not picked from a list. */
  isProblem: boolean;
}

/**
 * The Smart session asks a brand-new card as a guess (guessing before learning helps, with
 * feedback), a confident miss as multiple choice, and anything else as recall from memory.
 */
export function askKindFor(mode: SessionMode, item: PlanItem, hasEnoughDistractors: boolean): AskKind {
  if (item.isProblem || mode === "flashcards") return "recall";
  if (mode === "quiz") return hasEnoughDistractors ? "choice" : "recall";
  if (item.reason === "new") return "guess";
  return item.reason === "fix" && hasEnoughDistractors ? "choice" : "recall";
}

/**
 * Decides how each card in a session is asked. In the Smart session, up to 30% of the
 * session is moved to the way that has worked best for this student (recall or multiple
 * choice). Every card is still a self-test, and new cards are still guessed first.
 */
export function planKinds(items: PlanItem[], mode: SessionMode, hasEnoughDistractors: boolean, bestKind: AskKind | null): AskKind[] {
  const kinds = items.map((item) => askKindFor(mode, item, hasEnoughDistractors));
  if (mode !== "smart" || (bestKind !== "recall" && bestKind !== "choice")) return kinds;
  if (bestKind === "choice" && !hasEnoughDistractors) return kinds;

  const movable = kinds
    .map((kind, index) => ({ kind, index }))
    .filter(({ kind, index }) => kind !== "guess" && kind !== bestKind && !items[index].isProblem)
    .map(({ index }) => index);
  const budget = Math.min(movable.length, Math.floor(items.length * BEST_MODE_SHARE));
  // Spread the moved cards through the session rather than bunching them at the start.
  const chosen = new Set(Array.from({ length: budget }, (_, i) => movable[Math.floor((i * movable.length) / budget)]));
  return kinds.map((kind, index) => (chosen.has(index) ? bestKind : kind));
}

/** Which way of asking has led to the best later recall, if there is enough evidence to say. */
export function bestAskKind(results: { mode: string; accuracy: number }[]): AskKind | null {
  const kindOf: Record<string, AskKind> = { "smart-recall": "recall", flashcards: "recall", "smart-choice": "choice", quiz: "choice" };
  const best = results.find((r) => kindOf[r.mode]);
  return best ? kindOf[best.mode] : null;
}

/** Wrong options for a card: other answers from the same scope, never the right one. */
export function pickDistractors(answer: string, pool: string[], random: () => number = Math.random): string[] {
  const candidates = [...new Set(pool)].filter((text) => text !== answer);
  return shuffle(candidates, random).slice(0, DISTRACTOR_COUNT);
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sessionHref(scope: string, mode: SessionMode = "smart", size?: number): string {
  const params = new URLSearchParams({ scope, mode });
  if (size) params.set("size", String(size));
  return `/study/session?${params.toString()}`;
}
