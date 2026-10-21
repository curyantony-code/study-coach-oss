import type { Confidence, StudyMode } from "./learner/types";

export interface AttemptPayload {
  cardId: string;
  mode: StudyMode;
  correct: boolean;
  scope?: string;
  confidence?: Confidence | null;
  responseMs?: number | null;
  hintUsed?: boolean;
  distracted?: boolean;
  guessedFirst?: boolean;
}

/** Saves one answer to the local database. Resolves false (never throws) when it could not be saved. */
export async function logAttempt(payload: AttemptPayload): Promise<boolean> {
  try {
    const response = await fetch("/api/study/attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "course", confidence: null, responseMs: null, ...payload }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
