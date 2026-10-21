// When the AI returns too few questions for Test Me, the test is topped up from the
// vault's own study cards, so there is always something to sit.
import type { DiagMCQ, DiagSA } from "./diagnostic-types";
import { quizFromCards, type QuizCard } from "./quiz";

const LETTERS = ["A", "B", "C", "D"];
const MIN_EXPLAINABLE = 30;
const MAX_EXPLAINABLE = 700;

type GroupOf = (sourceSlug: string) => "late" | "early";

/** Multiple-choice questions built from cards, in the shape Test Me uses. */
export function mcqsFromCards(cards: QuizCard[], count: number, groupOf: GroupOf): DiagMCQ[] {
  return quizFromCards(cards, count)
    .filter((q) => q.options.length === LETTERS.length)
    .map((q) => ({
      stem: q.stem,
      options: q.options.map((option, i) => `${LETTERS[i]}. ${option.text}`),
      correct: LETTERS[q.options.findIndex((option) => option.correct)],
      explanation: `${q.explanation} [[${q.sourceSlug}]]`,
      sourceSlug: q.sourceSlug,
      group: groupOf(q.sourceSlug),
    }));
}

/** Short-answer prompts built from cards whose answer is long enough to be worth explaining. */
export function sasFromCards(cards: QuizCard[], count: number, groupOf: GroupOf, random: () => number = Math.random): DiagSA[] {
  const explainable = cards.filter((c) => c.type !== "problem" && c.back.trim().length >= MIN_EXPLAINABLE && c.back.length <= MAX_EXPLAINABLE && c.front.trim().length >= 3);
  const shuffled = explainable.map((card) => ({ card, key: random() })).sort((a, b) => a.key - b.key).map(({ card }) => card);
  return shuffled.slice(0, Math.max(count, 0)).map((card) => ({
    stem: `In your own words, explain the following and give one example of how it applies: ${card.front.trim()}`,
    concept: card.back.trim(),
    sourceSlug: card.source,
    group: groupOf(card.source),
  }));
}
