import type { VaultIndex } from "../vault/types";
import { nextAssessment } from "../vault/health";
import { assessmentReadiness, masteryOf, type Readiness, type StateMap } from "./mastery";
import { countQueue, type QueueCounts } from "./queue";
import { daysUntil } from "./schedule";
import { resolveScope, scopeToString, type Scope } from "./scope";

export interface ScopeOption {
  scope: string;
  label: string;
  detail: string;
  counts: QueueCounts;
  /** 0–1 across the scope's cards right now; null when it has no cards. */
  mastery: number | null;
}

export interface ScopeContextInput {
  index: VaultIndex;
  states: StateMap;
  now: Date;
  today: string;
}

function option({ index, states, now, today }: ScopeContextInput, scope: Scope, detail: string): ScopeOption | null {
  const resolved = resolveScope(index, scope, { today, states, now });
  if (!resolved) return null;
  return {
    scope: scopeToString(scope),
    label: resolved.label,
    detail,
    counts: countQueue(resolved.cards, states, now),
    mastery: resolved.cards.length === 0 ? null : masteryOf(resolved.cards, states, now),
  };
}

function present<T>(value: T | null): value is T {
  return value !== null;
}

export function dateDetail(date: string | null, now: Date): string {
  if (!date) return "No date set";
  const days = daysUntil(date, now);
  if (days < 0) return `Was on ${date}`;
  if (days === 0) return "Today";
  return `In ${days} day${days === 1 ? "" : "s"} · ${date}`;
}

export interface StudyOptions {
  recommended: ScopeOption;
  assessments: ScopeOption[];
  units: ScopeOption[];
  weakest: ScopeOption | null;
  course: ScopeOption;
}

/** Everything the scope picker shows, for one student and vault. */
export function studyOptions(input: ScopeContextInput): StudyOptions {
  const { index, today, now } = input;
  const course = option(input, { kind: "course" }, `${index.nodes.length} notes`)!;
  const upcoming = nextAssessment(index.assessments, today);
  const next = upcoming ? option(input, { kind: "next" }, dateDetail(upcoming.assessment.date, now)) : null;
  const hasProgress = input.states.size > 0;
  return {
    recommended: next ?? course,
    assessments: index.assessments
      .map((a) => option(input, { kind: "assessment", id: a.id }, dateDetail(a.date, now)))
      .filter(present),
    units: index.units.map((u) => option(input, { kind: "unit", id: u.id }, "")).filter(present),
    weakest: hasProgress ? option(input, { kind: "weakest" }, "Your lowest-scoring notes, confident misses first") : null,
    course,
  };
}

export interface ReadinessLine extends Readiness {
  /** Plain sentence, e.g. "Midterm in 9 days: 62% ready. Weakest: Week 3 — Workplace Laws". */
  sentence: string;
}

export function readinessLines({ index, states, now }: ScopeContextInput): ReadinessLine[] {
  const unitLabels = new Map(index.units.map((u) => [u.id, u.label]));
  return index.assessments.map((assessment) => {
    const readiness = assessmentReadiness(index, assessment, states, now);
    const percent = Math.round(readiness.readiness * 100);
    const days = assessment.date ? daysUntil(assessment.date, now) : null;
    const when = days === null ? "" : days < 0 ? " (past)" : days === 0 ? " today" : ` in ${days} day${days === 1 ? "" : "s"}`;
    const weakest = readiness.weakestUnitId ? ` Weakest: ${unitLabels.get(readiness.weakestUnitId) ?? readiness.weakestUnitId}.` : "";
    const sentence =
      readiness.cardCount === 0
        ? `${assessment.label}${when}: no cards cover it yet.`
        : `${assessment.label}${when}: ${percent}% ready.${weakest}`;
    return { ...readiness, sentence };
  });
}
