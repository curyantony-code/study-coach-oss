import { describe, expect, it } from "vitest";
import type { OutlineEntry } from "@/lib/schedule/outline";
import { buildPlan, draftPlan, placeDrafts, type Draft } from "@/lib/schedule/plan";
import { balance } from "@/lib/schedule/shared-plan";
import { defaultBudget } from "@/lib/schedule/shared-settings";

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const entry = (date: string, title: string, kind: OutlineEntry["kind"] = "class"): OutlineEntry => ({ date, kind, title, chapters: [] });
const loadByDay = (tasks: { date: string; minutes: number }[]) => {
  const load = new Map<string, number>();
  for (const task of tasks) load.set(task.date, (load.get(task.date) ?? 0) + task.minutes);
  return load;
};

/** Four courses that all meet on the same day, so every course wants the same days. */
const COURSES = ["FIN101", "FIN201", "MKTG201", "MKTG401"].map((id) => ({
  id,
  drafts: draftPlan([entry("2026-09-08", `${id} Topic 1`), entry("2026-09-15", `${id} Topic 2`), entry("2026-09-22", `${id} Topic 3`), entry("2026-10-06", `${id} Midterm`, "test")], "2026-12-08"),
}));

describe("placing several courses together", () => {
  const budget = { studyDays: EVERY_DAY, minutesPerDay: 60 };
  const together = balance(COURSES, budget);
  const all = [...together.values()].flat();

  it("keeps every day within the daily time when there is room nearby", () => {
    const apart = COURSES.flatMap((course) => placeDrafts(course.drafts, budget));
    const worstApart = Math.max(...loadByDay(apart).values());
    const worstTogether = Math.max(...loadByDay(all).values());
    // Planned apart, the four first passes all land on the day after class.
    expect(worstApart).toBeGreaterThan(budget.minutesPerDay);
    expect(worstTogether).toBeLessThan(worstApart);
    // The one fixed task (the evening before each test) is the only thing allowed to stack.
    const movable = loadByDay(all.filter((task) => task.kind !== "wind-down"));
    expect(Math.max(...movable.values())).toBeLessThanOrEqual(budget.minutesPerDay);
  });

  it("drops nothing and gives each course its own tasks back", () => {
    expect(all).toHaveLength(COURSES.reduce((sum, course) => sum + course.drafts.length, 0));
    for (const course of COURSES) {
      expect(together.get(course.id)!.map((task) => task.id).sort()).toEqual(course.drafts.map((draft) => draft.id).sort());
      expect(together.get(course.id)!.every((task) => !("course" in task))).toBe(true);
    }
  });

  it("moves a task only as far as its timing allows when it can", () => {
    for (const course of COURSES) {
      const firstPass = together.get(course.id)!.find((task) => task.id === "2026-09-08:learn:0")!;
      // Wanted the day after class; may slip two days, no further, while there is room.
      expect(firstPass.date >= "2026-09-09" && firstPass.date <= "2026-09-11").toBe(true);
    }
  });

  it("never moves the evening before a test, and never plans past a test or the final", () => {
    for (const tasks of together.values()) {
      expect(tasks.find((task) => task.id === "2026-10-06:wind-down:0")!.date).toBe("2026-10-05");
      expect(tasks.filter((task) => task.id.startsWith("2026-10-06:")).every((task) => task.date < "2026-10-06")).toBe(true);
      expect(tasks.every((task) => task.date < "2026-12-08")).toBe(true);
    }
  });

  it("gives the same answer every time", () => {
    expect([...balance(COURSES, budget).values()]).toEqual([...together.values()]);
    expect([...balance([...COURSES].reverse(), budget).get("FIN101")!]).toEqual(together.get("FIN101"));
  });
});

describe("placing tasks", () => {
  it("keeps a task rather than dropping it when the calendar is full", () => {
    const drafts: Draft[] = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, kind: "learn", title: `Task ${i}`, minutes: 60, about: "x", entryIndex: 0, wanted: "2026-09-09", latest: "2026-09-12", direction: 1, flex: 2 }));
    const placed = placeDrafts(drafts, { studyDays: EVERY_DAY, minutesPerDay: 60 });
    expect(placed).toHaveLength(30);
    expect(placed.every((task) => task.date >= "2026-09-09" && task.date <= "2026-09-12")).toBe(true);
    // Spread as evenly as four days allow.
    const loads = [...loadByDay(placed).values()];
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(60);
  });

  it("leaves a single course exactly as it was planned before", () => {
    const entries = [entry("2026-09-10", "Topic 1"), entry("2026-09-17", "Topic 2"), entry("2026-10-01", "Midterm", "test")];
    const plan = buildPlan(entries, "2026-10-15", { studyDays: EVERY_DAY, minutesPerDay: 120 });
    const on = (id: string) => plan.find((task) => task.id === id)?.date;
    expect([on("2026-09-10:learn:0"), on("2026-09-10:review:1"), on("2026-09-10:review:2"), on("2026-10-01:mock:0")]).toEqual(["2026-09-11", "2026-09-17", "2026-10-01", "2026-09-24"]);
  });
});

describe("the end of term", () => {
  it("spreads reviews that fall past the final over the days before it, and puts fixed tasks in first", () => {
    // Five classes in the last fortnight: their three-week reviews would all fall after the final.
    const classes = ["2026-11-23", "2026-11-25", "2026-11-27", "2026-11-30", "2026-12-02"].map((date, i) => entry(date, `Topic ${i + 1}`));
    const plan = buildPlan(classes, "2026-12-09", { studyDays: EVERY_DAY, minutesPerDay: 180 });
    const lateReviews = plan.filter((task) => task.id.endsWith(":review:2"));
    expect(lateReviews).toHaveLength(5);
    expect(lateReviews.every((task) => task.date < "2026-12-09")).toBe(true);
    // Not all on the last day.
    expect(new Set(lateReviews.map((task) => task.date)).size).toBeGreaterThan(2);
    // The evening before the final keeps its light review, and little else.
    const lastDay = plan.filter((task) => task.date === "2026-12-08");
    expect(lastDay.some((task) => task.kind === "wind-down")).toBe(true);
    expect(lastDay.reduce((sum, task) => sum + task.minutes, 0)).toBeLessThanOrEqual(80);
  });
});

describe("defaultBudget", () => {
  it("adds up the time given to each course, within a sane day, on any day one of them is studied", () => {
    expect(defaultBudget([{ studyDays: [1, 3], minutesPerDay: 60 }, { studyDays: [3, 5], minutesPerDay: 45 }])).toEqual({ studyDays: [1, 3, 5], minutesPerDay: 105 });
    expect(defaultBudget(Array.from({ length: 5 }, () => ({ studyDays: [1], minutesPerDay: 60 }))).minutesPerDay).toBe(180);
    expect(defaultBudget([])).toEqual({ studyDays: [1, 2, 3, 4, 5, 6], minutesPerDay: 60 });
  });
});
