// Hint fading (docs/ARCHITECTURE.md: worked examples help novices and hurt experts).
// While a note is weak its cards come with a cue; as mastery rises the cue becomes
// optional, then disappears, so the student does more of the retrieval alone.
import { splitMath } from "../mathtext";
import type { Card } from "../vault/types";

export type HintLevel = "full" | "light" | "none";

export const HINT_FULL_BELOW = 0.4;
export const HINT_NONE_ABOVE = 0.7;
const CUE_WORDS = 3;
/** Shorter answers get no cue: three opening words would be most of the answer. */
const MIN_WORDS_FOR_CUE = 8;

/** "full": the hint is shown with the question. "light": offered on request. "none": no hint. */
export function hintLevel(nodeMastery: number | null): HintLevel {
  if (nodeMastery === null || nodeMastery < HINT_FULL_BELOW) return "full";
  return nodeMastery > HINT_NONE_ABOVE ? "none" : "light";
}

/**
 * A cue that helps start the retrieval without giving the answer away: the required
 * formula for a worked problem, otherwise how the answer begins and how long it is.
 */
export function hintFor(card: Pick<Card, "back" | "problem">): string | null {
  if (card.problem?.formula) return `Formula: ${card.problem.formula}`;
  const [first] = splitMath(card.back);
  if (!first) return null;
  if (first.kind === "math") return "The answer starts with a formula.";
  const words = first.value.trim().split(/\s+/).filter(Boolean);
  const total = card.back.trim().split(/\s+/).length;
  if (words.length === 0 || total < MIN_WORDS_FOR_CUE) return null;
  return `Starts: “${words.slice(0, CUE_WORDS).join(" ")}…” (${total} words)`;
}
