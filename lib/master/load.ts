// Gathers each course's plan and progress for the all-courses overview. The vaults are only
// read; a course whose outline has never been read gets it read here, into the app's database.
import { getDb } from "../db/client";
import { getCardStates, getOrCreateStudent } from "../db/progress";
import { assessmentReadiness, masteryOf } from "../learner/mastery";
import { withScheduleDates } from "../schedule/assessments";
import { ensureSchedule } from "../schedule/auto";
import { plannedCourse, sharedPlan, type SharedPlan } from "../schedule/shared-plan";
import { hiddenCourses } from "../schedule/shared-settings";
import { getSchedule } from "../schedule/store";
import { listVaults, type Vault } from "../vault/registry";
import { localToday } from "../vault/health";
import { getVaultIndex } from "../vault/store";
import type { Budget } from "../schedule/plan";
import { courseCode, type MasterCourse, type MasterTest, type MasterTopic } from "./overview";

async function loadCourse(vault: Vault, studentId: number, now: Date, today: string, shared: SharedPlan): Promise<MasterCourse> {
  const db = getDb();
  const raw = getVaultIndex(vault);
  await ensureSchedule(vault, now);
  const schedule = getSchedule(vault.id);
  const index = { ...raw, assessments: withScheduleDates(raw.assessments, schedule, raw.units) };
  const states = getCardStates(db, studentId, vault.id);
  const built = schedule ? plannedCourse(vault, index, schedule, shared).plan : null;
  const done = new Set(schedule?.done ?? []);

  const tests: MasterTest[] = index.assessments.flatMap((assessment) => {
    if (!assessment.date) return [];
    const readiness = assessmentReadiness(index, assessment, states, now);
    return [{ courseId: vault.id, label: assessment.label.replace(/\s*\(date assumed\)$/, ""), date: assessment.date, assumed: /date assumed/.test(assessment.label), readiness: readiness.cardCount > 0 ? readiness.readiness : null }];
  });

  const topics: MasterTopic[] = [...index.units].sort((a, b) => a.order - b.order).map((unit) => {
    const cards = index.cards.filter((card) => card.unitIds.includes(unit.id));
    const taught = built?.entries.filter((entry, i) => entry.kind === "class" && built.unitIds[i] === unit.id).map((entry) => entry.date).sort()[0] ?? null;
    const covering = index.assessments.filter((a) => a.date && a.covers.includes(unit.id)).sort((a, b) => a.date!.localeCompare(b.date!));
    const next = covering.find((a) => a.date! >= today) ?? null;
    return {
      courseId: vault.id,
      unitId: unit.id,
      label: unit.label,
      cards: cards.length,
      studied: cards.filter((card) => states.has(card.id)).length,
      mastery: cards.length > 0 ? masteryOf(cards, states, now) : null,
      taughtOn: taught,
      nextTest: next ? { label: next.label.replace(/\s*\(date assumed\)$/, ""), date: next.date! } : null,
    };
  });

  const missing = raw.nodes.length === 0 ? "No notes were found in this folder." : !schedule ? "No course outline has been read yet." : !built ? "The outline has no classes to plan around." : null;
  return {
    id: vault.id,
    name: raw.course.name,
    code: courseCode(vault.name, raw.course.code),
    missing,
    unchecked: Boolean(schedule && !schedule.confirmed),
    tasks: (built?.plan ?? []).map((task) => ({ courseId: vault.id, id: task.id, date: task.date, kind: task.kind, title: task.title, minutes: task.minutes, done: done.has(task.id), href: built!.hrefFor(task) })),
    tests,
    topics,
  };
}

export interface LoadedCourses {
  shown: MasterCourse[];
  hidden: { id: string; name: string }[];
  /** The study time and days the shared plan was made with. */
  budget: Budget;
  budgetChosen: boolean;
}

/** Every vault's course, in the order they were added. Hidden ones are only named. */
export async function loadCourses(now: Date = new Date()): Promise<LoadedCourses> {
  const db = getDb();
  const student = getOrCreateStudent(db);
  const hidden = new Set(hiddenCourses());
  const vaults = listVaults(db);
  const shown: MasterCourse[] = [];
  const today = localToday(now);
  const visible = vaults.filter((v) => !hidden.has(v.id));
  // Outlines are read first, so a course opened here for the first time is part of the shared plan.
  for (const vault of visible) await ensureSchedule(vault, now).catch(() => undefined);
  const shared = sharedPlan();
  for (const vault of visible) {
    try {
      shown.push(await loadCourse(vault, student.id, now, today, shared));
    } catch (error) {
      // One course that cannot be read must not take the whole overview down.
      console.error(`The overview could not read ${vault.name}`, error);
      shown.push({ id: vault.id, name: vault.name, code: courseCode(vault.name), missing: "This course could not be read. Open it to see why.", unchecked: false, tasks: [], tests: [], topics: [] });
    }
  }
  return { shown, hidden: vaults.filter((v) => hidden.has(v.id)).map((v) => ({ id: v.id, name: v.name })), budget: shared.budget, budgetChosen: shared.budgetChosen };
}
