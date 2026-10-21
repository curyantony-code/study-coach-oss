import { randomInt } from "node:crypto";
import type { DiagMCQ } from "@/lib/diagnostic-types";

/** Normalize MCQ correct letter to A–D (matches client `normMcqLetter`). */
export function normMcqLetter(correct: string): string {
  const t = correct.trim().toUpperCase();
  if (/^[ABCD]$/.test(t)) return t;
  const m = t.match(/^([ABCD])/);
  return m ? m[1] : (t.charAt(0) || "?");
}

/** Leading option label A. / B) etc. → letter (matches client `optionLetter`). */
export function optionLetter(opt: string): string {
  const m = opt.trim().match(/^([A-Da-d])[\.\)]\s*/);
  return m ? m[1].toUpperCase() : opt.trim().charAt(0).toUpperCase();
}

function stripOptionPrefix(opt: string): string {
  return opt.trim().replace(/^[A-Da-d][\.\)]\s*/, "").trim();
}

/** Fisher–Yates shuffle in place using cryptographically strong indices. */
export function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function shuffledCopy<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  shuffleInPlace(out);
  return out;
}

/**
 * Permute MCQ options and re-label A.–D.; updates `correct` to the new letter for the same answer text.
 */
export function shuffleMcqOptions(q: DiagMCQ): DiagMCQ {
  const options = q.options;
  if (!Array.isArray(options) || options.length !== 4) return q;

  const bodies = options.map(stripOptionPrefix);
  const want = normMcqLetter(q.correct);
  let correctIdx = options.findIndex((opt) => optionLetter(opt) === want);
  if (correctIdx < 0) correctIdx = 0;

  const order = [0, 1, 2, 3];
  shuffleInPlace(order);

  const newOptions = order.map((origIdx, newPos) => {
    const letter = String.fromCharCode(65 + newPos);
    return `${letter}. ${bodies[origIdx]}`;
  });
  const newCorrectPos = order.indexOf(correctIdx);
  const newCorrect = String.fromCharCode(65 + newCorrectPos);

  return { ...q, options: newOptions, correct: newCorrect };
}
