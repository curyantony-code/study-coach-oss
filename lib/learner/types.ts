import type { Card as FsrsCard } from "ts-fsrs";

/** Asked before the answer is shown (docs/ARCHITECTURE.md: students misjudge what they know). */
export const CONFIDENCE_LEVELS = ["guessing", "fairly-sure", "certain"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const STUDY_MODES = ["smart-recall", "smart-choice", "flashcards", "quiz", "learn", "write", "match", "arcade", "problem", "guess-first", "mock-exam", "teach-back"] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

/** ts-fsrs card with dates as ISO strings, as stored in the database. */
export type StoredFsrs = Omit<FsrsCard, "due" | "last_review"> & { due: string; last_review?: string };

/** What the app remembers about one student and one card. */
export interface CardState {
  cardId: string;
  nodePath: string;
  fsrs: StoredFsrs | null;
  seen: number;
  correct: number;
  /** How many times the student was certain and wrong. */
  confidentWrong: number;
  /** True from a confident miss until the card is next answered correctly. */
  needsFix: boolean;
  guessedFirst: boolean;
  lastSeen: string | null;
}

export interface Attempt {
  cardId: string;
  nodePath: string;
  scope: string;
  mode: StudyMode;
  correct: boolean;
  confidence: Confidence | null;
  responseMs: number | null;
  createdAt: string;
}
