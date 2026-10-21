// One course's study plan, built from its stored schedule: the tasks, and where each one
// leads. Shared by the course's own Schedule page and the all-courses overview.
import { sessionHref } from "../learner/session";
import { parseProblemHeading } from "../problems/outline";
import type { VaultIndex } from "../vault/types";
import { unitForEntry } from "./match";
import type { OutlineEntry } from "./outline";
import { draftPlan, finalExam, placeDrafts, type Draft, type PlanTask } from "./plan";
import type { StoredSchedule } from "./store";

export interface CoursePlan {
  /** Classes, tests, breaks and deadlines; the final is kept apart in `finalDate`. */
  entries: OutlineEntry[];
  finalDate: string;
  plan: PlanTask[];
  /** For each entry, the unit a class is about, or null. */
  unitIds: (string | null)[];
  /** Where a task leads, inside its own course. */
  hrefFor: (task: PlanTask) => string;
}

export interface CourseDrafts {
  entries: OutlineEntry[];
  finalDate: string;
  drafts: Draft[];
  unitIds: (string | null)[];
  problemChapters: Set<number>;
}

/** The tasks a course calls for, before they are given days. Null when the schedule has no classes to plan around. */
export function courseDrafts(index: Pick<VaultIndex, "cards" | "units">, schedule: StoredSchedule): CourseDrafts | null {
  const entries = schedule.entries.filter((entry) => entry.kind !== "final");
  const finalDate = schedule.finalDate ?? finalExam(schedule.entries)?.date ?? null;
  if (!finalDate) return null;
  const problemChapters = new Set(index.cards.flatMap((card) => (card.problem ? [parseProblemHeading(card.problem.heading)?.chapter ?? -1] : [])));
  const unitIds = entries.map((entry) => (entry.kind === "class" ? unitForEntry(entry, index.units) : null));
  const hasProblems = (entry: OutlineEntry) => entry.chapters.some((chapter) => problemChapters.has(chapter));
  return { entries, finalDate, drafts: draftPlan(entries, finalDate, { hasProblems }), unitIds, problemChapters };
}

/**
 * A course's plan. `placed` is the course's share of a plan made together with the student's
 * other courses; without it the course is planned by itself, on its own study days.
 */
export function coursePlan(index: Pick<VaultIndex, "cards" | "units">, schedule: StoredSchedule, placed?: PlanTask[]): CoursePlan | null {
  const made = courseDrafts(index, schedule);
  if (!made) return null;
  const { entries, finalDate, unitIds, problemChapters } = made;
  const plan = placed ?? placeDrafts(made.drafts, { studyDays: schedule.studyDays, minutesPerDay: schedule.minutesPerDay });

  const hrefFor = (task: PlanTask): string => {
    const entry = entries[task.entryIndex];
    const unit = task.entryIndex >= 0 ? unitIds[task.entryIndex] : null;
    if (task.kind === "practice") {
      const chapter = entry?.chapters.find((c) => problemChapters.has(c));
      return chapter ? `/problems#ch${chapter}` : "/problems";
    }
    if (task.kind === "mock") return "/exam";
    if (task.kind === "weak-spots") return sessionHref("weakest");
    if (task.kind === "wind-down") return sessionHref("course", "flashcards", 10);
    return unit ? sessionHref(`unit:${unit}`) : "/study";
  };
  return { entries, finalDate, plan, unitIds, hrefFor };
}
