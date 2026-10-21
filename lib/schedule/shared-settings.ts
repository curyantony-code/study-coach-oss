// Settings that span every course: how much the student can study in a day across all of
// them, and which vaults are left out of the shared plan and the all-courses overview.
import { z } from "zod";
import { getDb } from "../db/client";
import { getSetting, setSetting } from "../vault/registry";
import type { Budget } from "./plan";

const HIDDEN = "master:hidden";
const BUDGET = "plan:budget";

export const MIN_DAILY_MINUTES = 30;
export const MAX_DAILY_MINUTES = 600;
/** Used until the student says otherwise: enough for several courses, short of an exhausting day. */
export const DEFAULT_DAILY_MINUTES = 180;

const budgetSchema = z.object({
  studyDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  minutesPerDay: z.number().int().min(MIN_DAILY_MINUTES).max(MAX_DAILY_MINUTES),
});

/** Vaults the student took out of the overview (a parent folder, a finished course, a notebook that is not a course). */
export function hiddenCourses(): string[] {
  try {
    const stored: unknown = JSON.parse(getSetting(getDb(), HIDDEN) || "[]");
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function toggleHidden(vaultId: string): void {
  const hidden = hiddenCourses();
  setSetting(getDb(), HIDDEN, JSON.stringify(hidden.includes(vaultId) ? hidden.filter((id) => id !== vaultId) : [...hidden, vaultId]));
}

/** The budget the student saved, or null when they have not chosen one. */
export function savedBudget(): Budget | null {
  try {
    const parsed = budgetSchema.safeParse(JSON.parse(getSetting(getDb(), BUDGET) || "null"));
    return parsed.success ? { studyDays: [...new Set(parsed.data.studyDays)].sort(), minutesPerDay: parsed.data.minutesPerDay } : null;
  } catch {
    return null;
  }
}

export function saveBudget(budget: Budget): void {
  setSetting(getDb(), BUDGET, JSON.stringify(budgetSchema.parse({ studyDays: [...new Set(budget.studyDays)].sort(), minutesPerDay: Math.round(budget.minutesPerDay) })));
}

/**
 * The budget to plan with when the student has not chosen one: every day any of their courses
 * is studied on, and the time they gave those courses added up, kept to a sane day.
 */
export function defaultBudget(courses: { studyDays: number[]; minutesPerDay: number }[]): Budget {
  const days = [...new Set(courses.flatMap((course) => course.studyDays))].sort();
  const total = courses.reduce((sum, course) => sum + course.minutesPerDay, 0);
  return {
    studyDays: days.length > 0 ? days : [1, 2, 3, 4, 5, 6],
    minutesPerDay: Math.min(Math.max(total, 60), DEFAULT_DAILY_MINUTES),
  };
}
