// Turns a course's class dates and test dates into a day-by-day study plan.
// The spacing follows docs/learning-science: meet the material soon after class, practise it
// within days, come back a week later and again a few weeks later, and rehearse before a test.
import type { OutlineEntry } from "./outline";

export type TaskKind = "learn" | "practice" | "review" | "mock" | "weak-spots" | "wind-down";

export interface PlanTask {
  /** Built from the class's date, the kind of task and its step, so ticks survive a rebuild of the plan. */
  id: string;
  date: string;
  kind: TaskKind;
  title: string;
  minutes: number;
  /** The class or test this task belongs to. */
  about: string;
  /** Index of that class or test in the entries, for linking to a unit. */
  entryIndex: number;
}

export interface PlanOptions {
  /** 0 = Sunday … 6 = Saturday. */
  studyDays: number[];
  /** Roughly how long the student can study on a study day. */
  minutesPerDay: number;
  /** Classes whose topic has worked problems to practise. */
  hasProblems?: (entry: OutlineEntry, index: number) => boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A final exam is assumed to fall this long after the last class until the student says otherwise. */
export const FINAL_AFTER_LAST_CLASS_DAYS = 7;

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Monday of the week a date falls in. */
export function weekStart(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

/** The final named in the outline, or a week after the last class when it names none. */
export function finalExam(entries: OutlineEntry[]): { date: string; assumed: boolean } | null {
  const named = entries.find((e) => e.kind === "final");
  if (named) return { date: named.date, assumed: false };
  const classes = entries.filter((e) => e.kind === "class");
  if (classes.length === 0) return null;
  return { date: addDays(classes[classes.length - 1].date, FINAL_AFTER_LAST_CLASS_DAYS), assumed: true };
}

/** "Topic 2: Portfolio Selection (ch. 7), covering one risky…" → "Topic 2: Portfolio Selection". */
export function shortTopic(title: string): string {
  const cut = title.split(/\s*(?:\(|, covering|; |\. |\s+Ch\.\s|\s•\s| - )/)[0].trim();
  const text = cut.length >= 6 ? cut : title;
  return text.length > 70 ? `${text.slice(0, 67).trimEnd()}…` : text;
}

function taskId(kind: TaskKind, entry: OutlineEntry, step: number): string {
  return `${entry.date}:${kind}:${step}`;
}

/** A task before it has a day: when it would ideally happen, and how far it may move. */
export interface Draft extends Omit<PlanTask, "date"> {
  wanted: string;
  /** Tasks before a test must not slide past it. */
  latest: string;
  /** Rehearsal tasks move earlier when their day is not free; the rest move later. */
  direction: 1 | -1;
  /** How many days it may move, in its direction, without hurting the spacing it is there for. */
  flex: number;
  /** The course it belongs to, when several courses are planned together. */
  course?: string;
}

/** How far each kind of task can move before its timing stops doing its job. */
const FLEX: Record<TaskKind, number> = { learn: 2, practice: 3, review: 3, mock: 3, "weak-spots": 2, "wind-down": 0 };
const SECOND_REVIEW_FLEX = 5;
/** Beyond its flexible days, a task may still be pushed this far to find room. */
const MAX_SHIFT_DAYS = 21;
const LAST_WEEK_DAYS = 6;

/**
 * The tasks a course calls for, each with its ideal day. Every class gets a first pass,
 * practice, and two spaced reviews; every test (the final included) gets a mock exam, a
 * weak-spots session and a light evening before. Nothing is wanted on or after the final.
 */
export function draftPlan(entries: OutlineEntry[], final: string, options: Pick<PlanOptions, "hasProblems"> = {}): Draft[] {
  const drafts: Draft[] = [];
  // Two classes on one day (a lecture and a lab) must not share task ids.
  const used = new Map<string, number>();
  const unique = (id: string) => {
    const count = (used.get(id) ?? 0) + 1;
    used.set(id, count);
    return count === 1 ? id : `${id}:${count}`;
  };
  const tests = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.kind === "test" && entry.date < final);
  const allTests = [...tests, { entry: { date: final, kind: "final" as const, title: "Final exam", chapters: [] }, index: -1 }];

  entries.forEach((entry, index) => {
    if (entry.kind !== "class" || entry.date >= final) return;
    const topic = shortTopic(entry.title);
    const dayBeforeFinal = addDays(final, -1);
    const add = (kind: TaskKind, step: number, offset: number, title: string, minutes: number) =>
      drafts.push({ id: unique(taskId(kind, entry, step)), kind, title, minutes, about: topic, entryIndex: index, wanted: addDays(entry.date, offset), latest: dayBeforeFinal, direction: 1, flex: step === 2 ? SECOND_REVIEW_FLEX : FLEX[kind] });
    add("learn", 0, 1, `First pass: ${topic}`, 30);
    if (options.hasProblems?.(entry, index)) add("practice", 0, 3, `Work the problems: ${topic}`, 40);
    add("review", 1, 7, `Review: ${topic}`, 20);
    add("review", 2, 21, `Second review: ${topic}`, 15);
  });

  for (const { entry, index } of allTests) {
    const name = entry.kind === "final" ? "the final exam" : shortTopic(entry.title);
    const dayBefore = addDays(entry.date, -1);
    const add = (kind: TaskKind, offset: number, title: string, minutes: number) =>
      drafts.push({ id: unique(taskId(kind, entry, 0)), kind, title, minutes, about: name, entryIndex: index, wanted: addDays(entry.date, offset), latest: dayBefore, direction: -1, flex: FLEX[kind] });
    add("mock", -7, `Timed mock exam for ${name}`, 60);
    add("weak-spots", -3, `Fix your weakest topics before ${name}`, 40);
    add("wind-down", -1, `Light review for ${name}, then a full night's sleep`, 20);
  }
  return drafts;
}

export interface Budget {
  /** 0 = Sunday … 6 = Saturday. */
  studyDays: number[];
  /** Study time available on a study day, across everything being planned together. */
  minutesPerDay: number;
}

export type PlacedTask = PlanTask & { course?: string };

/** A day is "comfortably full" at this multiple of the average day; past that, tasks look for a lighter day. */
const EVEN_DAY_FACTOR = 1.3;
/** A comfortable day is never set below this: one mock exam, or a first pass and a review. */
const MIN_EVEN_DAY_MINUTES = 60;

/**
 * The amount of study that makes a day comfortably full: a little over the average day in
 * this plan, and never more than the student has time for.
 */
export function evenDayMinutes(drafts: Draft[], budget: Budget): number {
  if (drafts.length === 0) return budget.minutesPerDay;
  const studyDays = new Set(budget.studyDays.length > 0 ? budget.studyDays : [0, 1, 2, 3, 4, 5, 6]);
  const first = drafts.reduce((min, d) => (d.wanted < min ? d.wanted : min), drafts[0].wanted);
  const last = drafts.reduce((max, d) => (d.latest > max ? d.latest : max), drafts[0].latest);
  const span = Math.max(1, daysBetween(first, last) + 1);
  // Counted from the week's pattern, so a long term is not walked day by day.
  const days = Math.max(1, Math.round((span * studyDays.size) / 7));
  const average = drafts.reduce((sum, d) => sum + d.minutes, 0) / days;
  return Math.min(budget.minutesPerDay, Math.max(MIN_EVEN_DAY_MINUTES, Math.ceil(average * EVEN_DAY_FACTOR)));
}

/**
 * Gives every task a day, keeping the days even. A task stays on its ideal day while that day
 * is a study day and not yet comfortably full. Otherwise it moves, within the days its timing
 * allows, to the lightest study day; only if those are all at the student's limit is it pushed
 * further, to the first day with room; and if the calendar is simply full it goes on the
 * lightest day in reach. No task is dropped.
 *
 * Drafts from several courses can be placed together: they then share the same days, which
 * is what stops one day from carrying every course's work.
 */
export function placeDrafts(drafts: Draft[], budget: Budget): PlacedTask[] {
  const studyDays = new Set(budget.studyDays.length > 0 ? budget.studyDays : [0, 1, 2, 3, 4, 5, 6]);
  const comfortable = evenDayMinutes(drafts, budget);
  const load = new Map<string, number>();
  const placed: PlacedTask[] = [];
  const fixed = (draft: Draft) => Number(draft.kind !== "wind-down");
  // Tasks that cannot move go in first, so the ones that can move make room for them.
  const ordered = [...drafts].sort((a, b) => fixed(a) - fixed(b) || a.wanted.localeCompare(b.wanted) || a.direction - b.direction || (a.course ?? "").localeCompare(b.course ?? "") || a.id.localeCompare(b.id));

  for (const draft of ordered) {
    // A task due after its deadline (a review that falls past the final) is done in the days
    // leading up to the deadline instead, spread over the last week and not piled on the last day.
    const late = draft.wanted > draft.latest;
    const start = late ? draft.latest : draft.wanted;
    const direction = late ? -1 : draft.direction;
    const flex = late ? Math.max(draft.flex, LAST_WEEK_DAYS) : draft.flex;
    const loadOn = (date: string) => load.get(date) ?? 0;
    // A task longer than the limit still has to go somewhere: an empty day always takes it.
    const within = (limit: number) => (date: string) => loadOn(date) + draft.minutes <= Math.max(limit, draft.minutes);
    // The days in reach, nearest first: its flexible days, then further out.
    const reach: string[] = [];
    for (let step = 0; step <= MAX_SHIFT_DAYS; step++) {
      const date = addDays(start, step * direction);
      if (date > draft.latest) break;
      if (studyDays.has(weekday(date))) reach.push(date);
    }
    // The lightest of some days; among equals, the one nearest the ideal day.
    const lightest = (dates: string[]) => dates.reduce<string | null>((best, date) => (best === null || loadOn(date) < loadOn(best) ? date : best), null);
    const flexible = reach.filter((date) => Math.abs(daysBetween(start, date)) <= flex);

    let chosen: string | null;
    // The evening before a test is kept whatever the day or the load.
    if (draft.kind === "wind-down") chosen = start;
    else if (reach[0] === start && within(comfortable)(start)) chosen = start;
    else chosen = lightest(flexible.filter(within(budget.minutesPerDay))) ?? reach.find(within(budget.minutesPerDay)) ?? lightest(reach) ?? start;

    load.set(chosen, loadOn(chosen) + draft.minutes);
    placed.push({ id: draft.id, date: chosen, kind: draft.kind, title: draft.title, minutes: draft.minutes, about: draft.about, entryIndex: draft.entryIndex, ...(draft.course ? { course: draft.course } : {}) });
  }
  return placed.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** One course planned by itself: its tasks, placed on the student's study days. */
export function buildPlan(entries: OutlineEntry[], final: string, options: PlanOptions): PlanTask[] {
  return placeDrafts(draftPlan(entries, final, options), { studyDays: options.studyDays, minutesPerDay: options.minutesPerDay });
}

export interface PlanWeek {
  start: string;
  tasks: PlanTask[];
}

export function byWeek(tasks: PlanTask[]): PlanWeek[] {
  const weeks = new Map<string, PlanTask[]>();
  for (const task of tasks) weeks.set(weekStart(task.date), [...(weeks.get(weekStart(task.date)) ?? []), task]);
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([start, list]) => ({ start, tasks: list }));
}
