// New practice questions modelled on the vault's own worked examples: the same method and
// structure, with the givens changed. The model sees one example and writes one variant.
import { questionIssues, SELF_CONTAINED_RULE } from "../questions/rules";
import type { Card } from "../vault/types";
import { numbersIn } from "./complete-question";

export interface VariantExample {
  cardId: string;
  /** The example's name in the notes, e.g. "T5 L2 - Homemade Leverage". */
  heading: string;
  question: string;
  solution: string;
}

export interface VariantQuestion {
  stem: string;
  options: { text: string; correct: boolean }[];
  explanation: string;
  /** Slug of the note the example lives in. */
  sourceSlug: string;
  /** The worked example this question was modelled on. */
  basedOn: { cardId: string; heading: string };
}

const MAX_QUESTION = 1800;
const MAX_SOLUTION = 2200;
const OPTIONS = 4;

/** Worked examples usable as models: a real question with a worked solution. */
export function examplesFrom(cards: Card[]): VariantExample[] {
  return cards
    .filter((card) => card.type === "problem" && card.problem && card.back.trim().length >= 40)
    .map((card) => ({
      cardId: card.id,
      heading: card.problem!.heading,
      // The note's own wording is the shorter, cleaner model when the card shows the textbook's.
      question: (card.problem!.original?.noteVersion && card.front.length > MAX_QUESTION ? card.problem!.original.noteVersion : card.front).slice(0, MAX_QUESTION),
      solution: card.back.slice(0, MAX_SOLUTION),
    }));
}

/** Spreads the picks across notes, so one long note does not supply every question. */
export function pickExamples<T extends { nodeId: string }>(pool: T[], count: number, random: () => number = Math.random): T[] {
  const byNote = new Map<string, T[]>();
  for (const item of [...pool].map((item) => ({ item, key: random() })).sort((a, b) => a.key - b.key).map(({ item }) => item)) {
    byNote.set(item.nodeId, [...(byNote.get(item.nodeId) ?? []), item]);
  }
  const queues = [...byNote.values()];
  const picked: T[] = [];
  while (picked.length < count && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && picked.length < count) picked.push(next);
    }
  }
  return picked;
}

export function variantSystemPrompt(courseName: string): string {
  return `You write practice questions for a student of ${courseName}. Each question is a VARIANT of a worked example from the student's own notes.

HOW TO BUILD A VARIANT
1. Keep the example's method, structure and what is being asked for. The student should solve it the same way.
2. Change the predictable variables: the given numbers (rates, prices, quantities, probabilities, years), and where natural the names or the setting. Pick realistic values that are different from the example's, and that keep the problem solvable.
3. If the example has no numbers, vary the scenario instead (different company, different facts) so the same concept must be applied.
4. Solve YOUR new question step by step, following the example's solution with the new values. Check the arithmetic twice.
5. Write exactly four options. One is the correct answer. The other three are the results of specific common mistakes (a wrong sign, a skipped step, the wrong formula, a percent/decimal slip), never random numbers. All four must differ.
6. The explanation shows the working for the new numbers in 2 to 5 short steps, then names the mistake behind one tempting wrong option.

${SELF_CONTAINED_RULE}

RULES
- Never copy the example's numbers into the new question.
- Write formulas in LaTeX between dollar signs. Write money as \\$1,000.
- Output ONLY a JSON array, no prose before or after.`;
}

export function variantUserPrompt(examples: VariantExample[]): string {
  const blocks = examples
    .map((example, i) => `<example index="${i}" name="${example.heading}">\n<question>\n${example.question}\n</question>\n<solution>\n${example.solution}\n</solution>\n</example>`)
    .join("\n\n");
  return `${blocks}

Write ONE variant question for EACH example above (${examples.length} in total), in the same order.

Return ONLY this JSON array:
[{"exampleIndex":0,"stem":"...","options":[{"text":"...","correct":true},{"text":"...","correct":false},{"text":"...","correct":false},{"text":"...","correct":false}],"explanation":"..."}]`;
}

/** How far apart two numbers may be and still count as the same value (rounding in the working). */
const SAME_VALUE = 0.005;

function sameValue(a: number, b: number): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) <= Math.max(Math.abs(y) * SAME_VALUE, 0.005);
  // 12% in an option is 0.12 in the working.
  return close(a, b) || close(a, b * 100) || close(a * 100, b);
}

/**
 * Checked by code, so no second model is paid to mark the first: the option marked correct
 * must be the value the explanation's own working arrives at. An answer in words passes.
 */
export function answerMatchesWorking(correctOption: string, explanation: string): boolean {
  const answer = numbersIn(correctOption);
  if (answer.length === 0) return true;
  const worked = numbersIn(explanation);
  return answer.some((value) => worked.some((w) => sameValue(value, w)));
}

/** True when a numeric example was handed back with its numbers unchanged. */
export function reusesExampleNumbers(stem: string, exampleQuestion: string): boolean {
  const fresh = numbersIn(stem);
  const original = new Set(numbersIn(exampleQuestion));
  return fresh.length >= 2 && original.size >= 2 && fresh.every((n) => original.has(n));
}

/** Keeps only well-formed variants and ties each back to its example. */
export function readVariants(rows: unknown[], examples: (VariantExample & { sourceSlug: string })[]): VariantQuestion[] {
  const questions: VariantQuestion[] = [];
  const used = new Set<number>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const index = typeof r.exampleIndex === "number" ? r.exampleIndex : Number.parseInt(String(r.exampleIndex ?? ""), 10);
    const example = examples[index];
    if (!example || used.has(index)) continue;
    if (typeof r.stem !== "string" || r.stem.trim().length < 20 || typeof r.explanation !== "string" || !Array.isArray(r.options)) continue;
    const options = r.options
      .filter((o): o is { text: unknown; correct: unknown } => Boolean(o) && typeof o === "object")
      .map((o) => ({ text: typeof o.text === "string" ? o.text.trim() : typeof o.text === "number" ? String(o.text) : "", correct: o.correct === true }));
    if (options.length !== OPTIONS || options.some((o) => o.text === "")) continue;
    if (options.filter((o) => o.correct).length !== 1) continue;
    if (new Set(options.map((o) => o.text.toLowerCase().replace(/\s+/g, ""))).size !== OPTIONS) continue;
    // The project rule holds for AI-written questions too: it must ask something and stand alone.
    if (questionIssues(r.stem).length > 0) continue;
    // A "variant" that repeats the example word for word teaches nothing new.
    if (r.stem.trim() === example.question.trim()) continue;
    if (reusesExampleNumbers(r.stem, example.question)) continue;
    if (!answerMatchesWorking(options.find((o) => o.correct)!.text, r.explanation)) continue;
    used.add(index);
    questions.push({ stem: r.stem.trim(), options, explanation: r.explanation.trim(), sourceSlug: example.sourceSlug, basedOn: { cardId: example.cardId, heading: example.heading } });
  }
  return questions;
}
