// One plan across every course. Each course says what tasks it needs and when it would like
// them; the tasks are then given days together, against one daily budget, so a day never
// carries more than the student has time for just because three courses wanted it.
import { getDb } from "../db/client";
import { listVaults, type Vault } from "../vault/registry";
import { getVaultIndex } from "../vault/store";
import type { VaultIndex } from "../vault/types";
import { courseDrafts, coursePlan, type CoursePlan } from "./course-plan";
import { placeDrafts, type Budget, type Draft, type PlanTask } from "./plan";
import { defaultBudget, hiddenCourses, savedBudget } from "./shared-settings";
import { getSchedule, type StoredSchedule } from "./store";

/** Places several courses' tasks together and hands each course its own back. */
export function balance(courses: { id: string; drafts: Draft[] }[], budget: Budget): Map<string, PlanTask[]> {
  const placed = placeDrafts(courses.flatMap((course) => course.drafts.map((draft) => ({ ...draft, course: course.id }))), budget);
  const byCourse = new Map<string, PlanTask[]>(courses.map((course) => [course.id, []]));
  for (const { course, ...task } of placed) byCourse.get(course ?? "")?.push(task);
  return byCourse;
}

export interface SharedPlan {
  budget: Budget;
  /** True when the student chose the budget; false while it is worked out from their courses. */
  budgetChosen: boolean;
  /** Each planned course's tasks, by vault id. Courses with no schedule, and hidden ones, are absent. */
  plans: Map<string, PlanTask[]>;
}

/** The plan across every course that has a schedule and is not hidden from the overview. */
export function sharedPlan(): SharedPlan {
  const hidden = new Set(hiddenCourses());
  const courses = listVaults(getDb()).filter((vault) => !hidden.has(vault.id)).flatMap((vault) => {
    const schedule = getSchedule(vault.id);
    if (!schedule) return [];
    try {
      const made = courseDrafts(getVaultIndex(vault), schedule);
      return made ? [{ id: vault.id, drafts: made.drafts, schedule }] : [];
    } catch (error) {
      // A course that cannot be read is left out; the others are still planned.
      console.error(`Planning left out ${vault.name}`, error);
      return [];
    }
  });
  const chosen = savedBudget();
  const budget = chosen ?? defaultBudget(courses.map((course) => course.schedule));
  return { budget, budgetChosen: chosen !== null, plans: balance(courses, budget) };
}

/**
 * A course's plan as the student should follow it: its share of the plan across all courses
 * when it is one of several, otherwise planned by itself.
 */
export function plannedCourse(vault: Pick<Vault, "id">, index: Pick<VaultIndex, "cards" | "units">, schedule: StoredSchedule, shared: SharedPlan = sharedPlan()): { plan: CoursePlan | null; shared: boolean } {
  const mine = shared.plans.get(vault.id);
  const together = mine !== undefined && shared.plans.size > 1;
  return { plan: coursePlan(index, schedule, together ? mine : undefined), shared: together };
}
