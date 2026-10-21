import type { Assessment, Card, VaultIndex } from "../vault/types";
import { retrievabilityAt } from "./schedule";
import type { CardState } from "./types";

export type StateMap = Map<string, CardState>;

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Mastery looks this far ahead. Right after any answer, even a wrong one, recall is close
 * to 100% because the answer was just on screen; a week out separates what is actually
 * learned from what was only just seen.
 */
export const MASTERY_HORIZON_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Mean chance of recalling these cards at `at`. Unseen cards count as 0. */
export function recallAt(cards: Card[], states: StateMap, at: Date): number {
  return mean(cards.map((c) => retrievabilityAt(states.get(c.id)?.fsrs ?? null, at)));
}

/** Mastery (0–1): the mean chance of still recalling these cards a week from `now`. */
export function masteryOf(cards: Card[], states: StateMap, now: Date): number {
  return recallAt(cards, states, new Date(now.getTime() + MASTERY_HORIZON_DAYS * MS_PER_DAY));
}

export interface NodeMastery {
  nodeId: string;
  cardCount: number;
  seenCount: number;
  /** null when the note has no cards, so there is nothing to master. */
  mastery: number | null;
  confidentWrong: number;
  lastStudied: string | null;
}

export function nodeMasteries(index: VaultIndex, states: StateMap, at: Date): NodeMastery[] {
  const byNode = new Map<string, Card[]>();
  for (const card of index.cards) byNode.set(card.nodeId, [...(byNode.get(card.nodeId) ?? []), card]);
  return index.nodes.map((node) => {
    const cards = byNode.get(node.id) ?? [];
    const seen = cards.map((c) => states.get(c.id)).filter((s): s is CardState => Boolean(s));
    const lastStudied = seen.map((s) => s.lastSeen).filter((d): d is string => d !== null).sort().pop() ?? null;
    return {
      nodeId: node.id,
      cardCount: cards.length,
      seenCount: seen.length,
      mastery: cards.length === 0 ? null : masteryOf(cards, states, at),
      confidentWrong: seen.reduce((sum, s) => sum + s.confidentWrong, 0),
      lastStudied,
    };
  });
}

export interface UnitMastery {
  unitId: string;
  cardCount: number;
  seenCount: number;
  /** Card-weighted: the mean over every card in the unit's notes. */
  mastery: number | null;
}

export function unitMasteries(index: VaultIndex, states: StateMap, at: Date): UnitMastery[] {
  return index.units.map((unit) => {
    const cards = index.cards.filter((c) => c.unitIds.includes(unit.id));
    return {
      unitId: unit.id,
      cardCount: cards.length,
      seenCount: cards.filter((c) => states.has(c.id)).length,
      mastery: cards.length === 0 ? null : masteryOf(cards, states, at),
    };
  });
}

/** Cards an assessment can draw on: its units' notes plus its practice notes, each card once. */
export function assessmentCards(index: VaultIndex, assessment: Assessment): Card[] {
  const covered = new Set(assessment.covers);
  const practice = new Set(assessment.practice);
  return index.cards.filter((c) => practice.has(c.nodeId) || c.unitIds.some((u) => covered.has(u)));
}

function endOfDay(dateIso: string): Date {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(year, month - 1, day, 9, 0, 0);
}

export interface Readiness {
  assessment: Assessment;
  cardCount: number;
  /** Predicted recall (0–1) on the assessment day, or today when it has no date or has passed. */
  readiness: number;
  projectedTo: Date;
  weakestUnitId: string | null;
}

export function assessmentReadiness(index: VaultIndex, assessment: Assessment, states: StateMap, now: Date): Readiness {
  const cards = assessmentCards(index, assessment);
  const examMorning = assessment.date ? endOfDay(assessment.date) : now;
  const projectedTo = examMorning.getTime() > now.getTime() ? examMorning : now;
  const perUnit = assessment.covers
    .map((unitId) => ({ unitId, cards: cards.filter((c) => c.unitIds.includes(unitId)) }))
    .filter((u) => u.cards.length > 0)
    .map((u) => ({ unitId: u.unitId, mastery: recallAt(u.cards, states, projectedTo) }))
    .sort((a, b) => a.mastery - b.mastery);
  return {
    assessment,
    cardCount: cards.length,
    readiness: recallAt(cards, states, projectedTo),
    projectedTo,
    weakestUnitId: perUnit[0]?.unitId ?? null,
  };
}
