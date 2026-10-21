// Server-side glue between the active vault, the database and the pure learner rules.
import { getDb } from "../db/client";
import {
  getCardState, getCardStates, getOrCreateStudent, insertAttempt, inTransaction, saveCardState, type Student,
} from "../db/progress";
import { getActiveContent } from "../vault/active";
import { localToday, nextAssessment } from "../vault/health";
import type { Vault } from "../vault/registry";
import type { Card, VaultIndex } from "../vault/types";
import { legacyToStates, type LegacyProgress } from "./legacy";
import type { StateMap } from "./mastery";
import { buildQueue, type QueueItem } from "./queue";
import { applyAnswer } from "./schedule";
import { parseScope, resolveScope, type ResolvedScope } from "./scope";
import type { CardState, Confidence, StudyMode } from "./types";

export interface StudyContext {
  vault: Vault;
  index: VaultIndex;
  student: Student;
  states: StateMap;
  now: Date;
  today: string;
}

export async function getStudyContext(): Promise<StudyContext | null> {
  const active = await getActiveContent();
  if (!active) return null;
  const db = getDb();
  const student = getOrCreateStudent(db);
  const now = new Date();
  return { ...active, student, states: getCardStates(db, student.id, active.vault.id), now, today: localToday(now) };
}

export function resolveScopeText(ctx: StudyContext, scopeText: string | null | undefined): ResolvedScope | null {
  const scope = parseScope(scopeText);
  return scope ? resolveScope(ctx.index, scope, { today: ctx.today, states: ctx.states, now: ctx.now }) : null;
}

export interface SessionQueue {
  scope: ResolvedScope;
  items: QueueItem[];
}

export function getSessionQueue(ctx: StudyContext, scopeText: string, limit: number): SessionQueue | null {
  const scope = resolveScopeText(ctx, scopeText);
  if (!scope) return null;
  return { scope, items: buildQueue(scope.cards, ctx.states, { now: ctx.now, limit, emphasis: scope.emphasis }) };
}

/**
 * The assessment date that puts a card in exam mode: the scope's own assessment when
 * studying one, otherwise the next upcoming assessment that covers the card.
 */
function examDateFor(ctx: StudyContext, card: Card, scope: ResolvedScope | null): string | null {
  if (scope?.assessment) return scope.assessment.date;
  const covering = ctx.index.assessments.filter(
    (a) => a.practice.includes(card.nodeId) || a.covers.some((unit) => card.unitIds.includes(unit))
  );
  return nextAssessment(covering, ctx.today)?.assessment.date ?? null;
}

export interface AnswerInput {
  cardId: string;
  scope: string;
  mode: StudyMode;
  correct: boolean;
  confidence: Confidence | null;
  responseMs: number | null;
  guessedFirst?: boolean;
  /** The student opened a hint (e.g. the required formula) before answering. */
  hintUsed?: boolean;
  /** The student left the tab while this card was on screen. */
  distracted?: boolean;
}

export type AnswerResult = { ok: true; state: CardState } | { ok: false; error: string };

/** Applies one answer. Must run inside a transaction: it reads the card's state, then writes it back. */
function applyOne(ctx: StudyContext, card: Card, input: AnswerInput, scope: ResolvedScope | null): CardState {
  const db = getDb();
  const previous = getCardState(db, ctx.student.id, ctx.vault.id, card.id);
  const next = applyAnswer(previous, { cardId: card.id, nodePath: card.nodeId }, input, ctx.now, examDateFor(ctx, card, scope));
  saveCardState(db, ctx.student.id, ctx.vault.id, next);
  insertAttempt(db, ctx.student.id, ctx.vault.id, {
    cardId: card.id,
    nodePath: card.nodeId,
    scope: input.scope,
    mode: input.mode,
    correct: input.correct,
    confidence: input.confidence,
    responseMs: input.responseMs,
    hintUsed: input.hintUsed,
    distracted: input.distracted,
    createdAt: ctx.now.toISOString(),
  });
  return next;
}

/** Saves one answer: updates the card's memory state and appends to the attempts log. */
export function recordAnswer(ctx: StudyContext, input: AnswerInput): AnswerResult {
  const card = ctx.index.cards.find((c) => c.id === input.cardId);
  if (!card) return { ok: false, error: "That card is not in the vault you are studying." };
  const scope = resolveScopeText(ctx, input.scope);
  // Read and write in one transaction so two quick answers cannot overwrite each other.
  return { ok: true, state: inTransaction(getDb(), () => applyOne(ctx, card, input, scope)) };
}

/**
 * Saves a batch of answers (a whole mock exam) as one unit: all of them or none.
 * `claim` runs first inside the same transaction; if it returns false nothing is recorded,
 * which is how a paper is kept from being saved twice.
 */
export function recordAnswers(ctx: StudyContext, inputs: AnswerInput[], claim: () => boolean): boolean {
  const byId = new Map(ctx.index.cards.map((c) => [c.id, c]));
  return inTransaction(getDb(), () => {
    if (!claim()) return false;
    for (const input of inputs) {
      const card = byId.get(input.cardId);
      if (card) applyOne(ctx, card, input, resolveScopeText(ctx, input.scope));
    }
    return true;
  });
}

/** One-time import of the old app's browser progress into the active vault. Safe to repeat. */
export function importLegacyProgress(ctx: StudyContext, legacy: LegacyProgress): number {
  const db = getDb();
  const states = legacyToStates(legacy, ctx.index.cards, ctx.states, ctx.now);
  inTransaction(db, () => {
    for (const state of states) saveCardState(db, ctx.student.id, ctx.vault.id, state);
  });
  return states.length;
}
