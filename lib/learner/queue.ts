import { isReferenceNote } from "../course";
import type { Card } from "../vault/types";
import { isDue, retrievabilityAt } from "./schedule";
import type { StateMap } from "./mastery";

export const DEFAULT_SESSION_SIZE = 10;

/** Why a card is in the session, in priority order. */
export type QueueReason = "fix" | "due" | "new" | "extra";

export interface QueueItem {
  card: Card;
  reason: QueueReason;
  retrievability: number;
}

export interface QueueOptions {
  now: Date;
  limit?: number;
  /** Units whose new cards are introduced first. */
  emphasis?: string[];
  /** Low-sleep day: review only, no new material (docs/ARCHITECTURE.md). */
  reviewOnly?: boolean;
}

/** Takes one card from each unit in turn, so similar ideas from different units get mixed. */
function interleaveByUnit(cards: Card[]): Card[] {
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const key = card.unitIds[0] ?? "";
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  const lanes = [...groups.values()];
  const longest = Math.max(0, ...lanes.map((lane) => lane.length));
  return Array.from({ length: longest }, (_, i) => lanes.flatMap((lane) => (lane[i] ? [lane[i]] : []))).flat();
}

/**
 * Orders a scope's cards for one session:
 * 1. confident misses not yet fixed, 2. reviews that are due (most overdue, then weakest first),
 * 3. new cards (topic notes before reference sheets, emphasised units first, units interleaved),
 * 4. if there is still room,
 * the weakest cards that are not due yet, as extra practice.
 */
export function buildQueue(cards: Card[], states: StateMap, options: QueueOptions): QueueItem[] {
  const { now, limit = DEFAULT_SESSION_SIZE, emphasis = [], reviewOnly = false } = options;
  const item = (card: Card, reason: QueueReason): QueueItem => ({
    card,
    reason,
    retrievability: retrievabilityAt(states.get(card.id)?.fsrs ?? null, now),
  });
  const byWeakest = (a: QueueItem, b: QueueItem) => a.retrievability - b.retrievability;
  const dueTime = (card: Card) => Date.parse(states.get(card.id)!.fsrs!.due);

  const seen = cards.filter((c) => states.get(c.id)?.fsrs);
  const fix = seen.filter((c) => states.get(c.id)!.needsFix).map((c) => item(c, "fix")).sort(byWeakest);
  const fixIds = new Set(fix.map((i) => i.card.id));
  const due = seen
    .filter((c) => !fixIds.has(c.id) && isDue(states.get(c.id), now))
    .map((c) => item(c, "due"))
    .sort((a, b) => dueTime(a.card) - dueTime(b.card) || byWeakest(a, b));

  const emphasised = new Set(emphasis);
  const unseen = cards.filter((c) => !states.get(c.id)?.fsrs);
  const isEmphasised = (c: Card) => c.unitIds.some((u) => emphasised.has(u));
  // A topic is met in its own note before it turns up on a formula sheet or in a glossary.
  const topics = unseen.filter((c) => !isReferenceNote(c.nodeId));
  const sheets = unseen.filter((c) => isReferenceNote(c.nodeId));
  const fresh = reviewOnly
    ? []
    : [topics.filter(isEmphasised), topics.filter((c) => !isEmphasised(c)), sheets.filter(isEmphasised), sheets.filter((c) => !isEmphasised(c))]
        .flatMap(interleaveByUnit)
        .map((c) => item(c, "new"));

  const notDue = seen
    .filter((c) => !fixIds.has(c.id) && !isDue(states.get(c.id), now))
    .map((c) => item(c, "extra"))
    .sort(byWeakest);

  return [...fix, ...due, ...fresh, ...notDue].slice(0, limit);
}

export interface QueueCounts {
  total: number;
  fix: number;
  due: number;
  fresh: number;
}

export function countQueue(cards: Card[], states: StateMap, now: Date): QueueCounts {
  const full = buildQueue(cards, states, { now, limit: Number.MAX_SAFE_INTEGER });
  const count = (reason: QueueReason) => full.filter((i) => i.reason === reason).length;
  return { total: cards.length, fix: count("fix"), due: count("due"), fresh: count("new") };
}
