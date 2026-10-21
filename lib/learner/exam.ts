// Mock exam: a timed, mixed-unit paper in the assessment's own format (docs/ARCHITECTURE.md).
// No feedback until the end, like the real thing.
import type { Assessment, Card } from "../vault/types";
import { retrievabilityAt } from "./schedule";
import type { StateMap } from "./mastery";
import { DISTRACTOR_COUNT, pickDistractors, shuffle } from "./session";

export const DEFAULT_EXAM_SIZE = 20;
/** Minutes allowed per question, by kind. */
export const MINUTES_PER_QUESTION = { choice: 1, written: 2 } as const;
/** Emphasised units get this many times the weight of the others when questions are drawn. */
const EMPHASIS_WEIGHT = 2;

export type ExamQuestionKind = "choice" | "written";

export interface ExamQuestion {
  cardId: string;
  kind: ExamQuestionKind;
  prompt: string;
  /** Four options for multiple choice; empty for written answers. */
  options: string[];
  unitId: string | null;
}

export interface ExamPaper {
  questions: ExamQuestion[];
  minutes: number;
}

/** Which question kinds an assessment's `format` calls for. No format listed means both. */
export function kindsFor(format: string[]): ExamQuestionKind[] {
  const text = format.join(" ").toLowerCase();
  const choice = /mcq|multiple|choice|true/.test(text);
  const written = /short|essay|written|problem|calculation|long/.test(text);
  if (choice && !written) return ["choice"];
  if (written && !choice) return ["written"];
  return ["choice", "written"];
}

/**
 * Draws the questions: weaker cards and emphasised units are more likely, and the paper
 * moves between units rather than finishing one before starting the next.
 */
export function buildExam(
  cards: Card[],
  states: StateMap,
  assessment: Pick<Assessment, "format" | "emphasis">,
  options: { now: Date; count?: number; random?: () => number }
): ExamPaper {
  const { now, count = DEFAULT_EXAM_SIZE, random = Math.random } = options;
  const kinds = kindsFor(assessment.format);
  const emphasised = new Set(assessment.emphasis);
  const pool = [...new Set(cards.filter((c) => c.type !== "problem").map((c) => c.back))];

  // Weighted sampling without replacement (Efraimidis–Spirakis): key = u^(1/weight), take the largest.
  const drawn = cards
    .map((card) => {
      const weakness = 1 - retrievabilityAt(states.get(card.id)?.fsrs ?? null, now);
      const weight = (0.25 + weakness) * (card.unitIds.some((u) => emphasised.has(u)) ? EMPHASIS_WEIGHT : 1);
      return { card, key: Math.pow(random(), 1 / weight) };
    })
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map(({ card }) => card);

  const questions = shuffle(drawn, random).map((card, i): ExamQuestion => {
    const distractors = pickDistractors(card.back, pool, random);
    const wantsChoice = kinds.length === 1 ? kinds[0] === "choice" : i % 2 === 0;
    // Worked problems are always written; multiple choice needs enough wrong options.
    const kind: ExamQuestionKind = card.type !== "problem" && wantsChoice && distractors.length >= DISTRACTOR_COUNT ? "choice" : "written";
    return {
      cardId: card.id,
      kind,
      prompt: card.front,
      options: kind === "choice" ? shuffle([card.back, ...distractors], random) : [],
      unitId: card.unitIds[0] ?? null,
    };
  });

  const minutes = Math.max(1, Math.ceil(questions.reduce((sum, q) => sum + MINUTES_PER_QUESTION[q.kind], 0)));
  return { questions, minutes };
}

export interface ExamAnswer {
  cardId: string;
  /** The option picked, the text written, or "" when left blank. */
  response: string;
  /** For written answers: the student's own mark after seeing the model answer. Null until marked. */
  selfMark: boolean | null;
}

export interface MarkedQuestion {
  cardId: string;
  kind: ExamQuestionKind;
  prompt: string;
  response: string;
  answer: string;
  /** Null for a written answer the student has not marked yet. */
  correct: boolean | null;
  unitId: string | null;
}

export interface UnitScore {
  unitId: string | null;
  correct: number;
  total: number;
}

export interface ExamResult {
  marked: MarkedQuestion[];
  correct: number;
  total: number;
  /** Written answers still waiting for the student's own mark. */
  unmarked: number;
  byUnit: UnitScore[];
}

/** Marks a paper: multiple choice against the card, written answers by the student's own mark. */
export function markExam(questions: ExamQuestion[], answers: ExamAnswer[], cards: Card[]): ExamResult {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const answerFor = new Map(answers.map((a) => [a.cardId, a]));
  const marked = questions
    .filter((q) => byId.has(q.cardId))
    .map((q): MarkedQuestion => {
      const card = byId.get(q.cardId)!;
      const given = answerFor.get(q.cardId);
      const response = given?.response ?? "";
      const correct = q.kind === "choice" ? response === card.back : response.trim() === "" ? false : given?.selfMark ?? null;
      return { cardId: q.cardId, kind: q.kind, prompt: q.prompt, response, answer: card.back, correct, unitId: q.unitId };
    });

  const units = [...new Set(marked.map((m) => m.unitId))];
  return {
    marked,
    correct: marked.filter((m) => m.correct === true).length,
    total: marked.length,
    unmarked: marked.filter((m) => m.correct === null).length,
    byUnit: units.map((unitId) => {
      const inUnit = marked.filter((m) => m.unitId === unitId);
      return { unitId, correct: inUnit.filter((m) => m.correct === true).length, total: inUnit.length };
    }),
  };
}
