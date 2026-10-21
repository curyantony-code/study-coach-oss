import { createEmptyCard, fsrs, generatorParameters, Rating, State, TypeConvert, type Card as FsrsCard, type Grade } from "ts-fsrs";
import type { CardState, Confidence, StoredFsrs } from "./types";

export const BASE_RETENTION = 0.9;
export const EXAM_RETENTION = 0.95;
/** Exam mode starts this many days before an assessment. */
export const EXAM_MODE_DAYS = 14;
/** Every card should be reviewed at least once in this many days before the assessment. */
export const FINAL_REVIEW_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface AnswerSignal {
  correct: boolean;
  confidence: Confidence | null;
}

/** docs/ARCHITECTURE.md: wrong → Again; guessing → Hard; fairly sure or not asked → Good; certain → Easy. */
export function toRating({ correct, confidence }: AnswerSignal): Grade {
  if (!correct) return Rating.Again;
  if (confidence === "guessing") return Rating.Hard;
  if (confidence === "certain") return Rating.Easy;
  return Rating.Good;
}

/**
 * Calendar days from today to the assessment day (0 on the day, negative once passed).
 * Counted on dates rather than elapsed hours, so a clock change cannot shift it by one.
 */
export function daysUntil(dateIso: string, now: Date): number {
  const [year, month, day] = dateIso.split("-").map(Number);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(year, month - 1, day) - today) / MS_PER_DAY);
}

export function isExamMode(examDate: string | null, now: Date): boolean {
  if (!examDate) return false;
  const days = daysUntil(examDate, now);
  return days >= 0 && days <= EXAM_MODE_DAYS;
}

export function desiredRetention(examDate: string | null, now: Date): number {
  return isExamMode(examDate, now) ? EXAM_RETENTION : BASE_RETENTION;
}

function scheduler(retention: number) {
  // No fuzz and no minute-level learning steps: reviews land on whole days, which is
  // what a student who studies in sessions expects ("come back tomorrow").
  return fsrs(generatorParameters({ request_retention: retention, enable_fuzz: false, enable_short_term: false }));
}

function toStored(card: FsrsCard): StoredFsrs {
  return { ...card, due: card.due.toISOString(), last_review: card.last_review?.toISOString() };
}

/**
 * In exam mode a review that would land after the assessment is pulled into the final
 * days before it, so each card is seen at least once in that window.
 */
export function clampDueForExam(due: Date, now: Date, examDate: string | null): Date {
  if (!examDate || !isExamMode(examDate, now)) return due;
  const [year, month, day] = examDate.split("-").map(Number);
  const examDay = new Date(year, month - 1, day);
  if (due.getTime() < examDay.getTime()) return due;
  const windowStart = new Date(examDay.getTime() - FINAL_REVIEW_DAYS * MS_PER_DAY);
  const tomorrow = new Date(now.getTime() + MS_PER_DAY);
  // Already inside the window: today's review counts, so only come back if there is a day left.
  if (now.getTime() >= windowStart.getTime()) return tomorrow.getTime() < examDay.getTime() ? tomorrow : due;
  return windowStart;
}

/** Applies one answer to a card's memory state and returns the new state. */
export function reviewCard(previous: StoredFsrs | null, signal: AnswerSignal, now: Date, examDate: string | null): StoredFsrs {
  const card: FsrsCard = previous ? TypeConvert.card(previous) : createEmptyCard(now);
  const next = scheduler(desiredRetention(examDate, now)).next(card, now, toRating(signal)).card;
  return toStored({ ...next, due: clampDueForExam(next.due, now, examDate) });
}

/** Chance (0–1) the student can recall the card at `at`. Unseen cards are 0. */
export function retrievabilityAt(stored: StoredFsrs | null, at: Date): number {
  if (!stored || stored.state === State.New) return 0;
  return scheduler(BASE_RETENTION).get_retrievability(TypeConvert.card(stored), at, false);
}

export function isDue(state: CardState | null | undefined, now: Date): boolean {
  return Boolean(state?.fsrs) && Date.parse(state!.fsrs!.due) <= now.getTime();
}

/** Folds one answer into everything remembered about the card. */
export function applyAnswer(
  previous: CardState | null,
  card: { cardId: string; nodePath: string },
  signal: AnswerSignal & { guessedFirst?: boolean },
  now: Date,
  examDate: string | null
): CardState {
  const confidentMiss = !signal.correct && signal.confidence === "certain";
  return {
    cardId: card.cardId,
    nodePath: card.nodePath,
    fsrs: reviewCard(previous?.fsrs ?? null, signal, now, examDate),
    seen: (previous?.seen ?? 0) + 1,
    correct: (previous?.correct ?? 0) + (signal.correct ? 1 : 0),
    confidentWrong: (previous?.confidentWrong ?? 0) + (confidentMiss ? 1 : 0),
    needsFix: signal.correct ? false : confidentMiss || (previous?.needsFix ?? false),
    guessedFirst: (previous?.guessedFirst ?? false) || Boolean(signal.guessedFirst && !previous),
    lastSeen: now.toISOString(),
  };
}
