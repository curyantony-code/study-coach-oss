import { CONFIDENCE_LEVELS, type Attempt, type Confidence, type StudyMode } from "./types";

/** A mode needs this many later reviews before it can be called a student's best. */
export const MIN_LATER_REVIEWS = 3;

export interface CalibrationRow {
  confidence: Confidence;
  answers: number;
  /** Share answered correctly (0–1), or null when this level was never used. */
  accuracy: number | null;
}

/** "When certain, right X%": how well the student's confidence predicts being right. */
export function calibration(attempts: Attempt[]): CalibrationRow[] {
  return CONFIDENCE_LEVELS.map((confidence) => {
    const rated = attempts.filter((a) => a.confidence === confidence);
    return {
      confidence,
      answers: rated.length,
      accuracy: rated.length === 0 ? null : rated.filter((a) => a.correct).length / rated.length,
    };
  });
}

export interface ModeResult {
  mode: StudyMode;
  laterReviews: number;
  accuracy: number;
}

/**
 * Which mode makes things stick: for each card, the mode it was first studied in gets
 * credit for how the student does on that card's later reviews. Modes with too few
 * later reviews are left out rather than guessed at.
 */
export function modeResults(attempts: Attempt[]): ModeResult[] {
  const ordered = [...attempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const firstMode = new Map<string, StudyMode>();
  const tally = new Map<StudyMode, { later: number; correct: number }>();
  for (const attempt of ordered) {
    const first = firstMode.get(attempt.cardId);
    if (!first) {
      firstMode.set(attempt.cardId, attempt.mode);
      continue;
    }
    const current = tally.get(first) ?? { later: 0, correct: 0 };
    tally.set(first, { later: current.later + 1, correct: current.correct + (attempt.correct ? 1 : 0) });
  }
  return [...tally.entries()]
    .filter(([, t]) => t.later >= MIN_LATER_REVIEWS)
    .map(([mode, t]) => ({ mode, laterReviews: t.later, accuracy: t.correct / t.later }))
    .sort((a, b) => b.accuracy - a.accuracy || b.laterReviews - a.laterReviews);
}

function previousDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const d = new Date(year, month - 1, date - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Consecutive study days ending today, or ending yesterday if today has not been studied yet. */
export function streak(studyDays: string[], today: string): number {
  const days = new Set(studyDays);
  let cursor = days.has(today) ? today : previousDay(today);
  let count = 0;
  while (days.has(cursor)) {
    count++;
    cursor = previousDay(cursor);
  }
  return count;
}
