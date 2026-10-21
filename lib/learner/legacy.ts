import { z } from "zod";
import type { Card } from "../vault/types";
import { applyAnswer } from "./schedule";
import type { CardState } from "./types";

/** What the original app kept in the browser under the `study-coach-*` keys. */
export const legacyProgressSchema = z.object({
  known: z.array(z.string()).max(5000).default([]),
  progress: z
    .array(
      z.object({
        id: z.string(),
        correct: z.number().int().min(0).default(0),
        incorrect: z.number().int().min(0).default(0),
        lastSeen: z.string().default(""),
      })
    )
    .max(5000)
    .default([]),
});

export type LegacyProgress = z.infer<typeof legacyProgressSchema>;

function validDate(text: string, fallback: Date): Date {
  const time = Date.parse(text);
  return Number.isNaN(time) || time > fallback.getTime() ? fallback : new Date(time);
}

/**
 * Converts old browser progress into card states. The old app only stored counts, so each
 * card gets a single review: "right" if it was ever answered correctly or marked known,
 * otherwise "wrong". Cards that already have new progress, or no longer exist, are skipped.
 */
export function legacyToStates(legacy: LegacyProgress, cards: Card[], existing: Map<string, CardState>, now: Date): CardState[] {
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const known = new Set(legacy.known);
  const entries = new Map(legacy.progress.map((p) => [p.id, p]));
  const ids = [...new Set([...entries.keys(), ...known])].filter((id) => cardsById.has(id) && !existing.has(id));

  return ids.map((id) => {
    const entry = entries.get(id);
    const card = cardsById.get(id)!;
    const correct = known.has(id) || (entry?.correct ?? 0) > 0;
    const when = validDate(entry?.lastSeen ?? "", now);
    const state = applyAnswer(null, { cardId: id, nodePath: card.nodeId }, { correct, confidence: null }, when, null);
    const rightCount = Math.max(entry?.correct ?? 0, correct ? 1 : 0);
    return { ...state, seen: Math.max(1, rightCount + (entry?.incorrect ?? 0)), correct: rightCount };
  });
}
