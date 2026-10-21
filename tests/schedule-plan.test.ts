import { describe, expect, test } from "vitest";
import { unitForEntry } from "@/lib/schedule/match";
import type { OutlineEntry } from "@/lib/schedule/outline";
import { addDays, buildPlan, byWeek, daysBetween, finalExam, shortTopic, weekStart } from "@/lib/schedule/plan";
import type { Unit } from "@/lib/vault/types";

const entry = (date: string, title: string, kind: OutlineEntry["kind"] = "class", chapters: number[] = []): OutlineEntry => ({ date, kind, title, chapters });
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

describe("finalExam", () => {
  test("is assumed to be a week after the last class when the outline names none", () => {
    const entries = [entry("2026-09-10", "Topic 1"), entry("2026-12-03", "Review"), entry("2026-11-01", "Quiz 1", "test")];
    expect(finalExam(entries)).toEqual({ date: "2026-12-10", assumed: true });
  });

  test("uses the outline's own date when it has one", () => {
    expect(finalExam([entry("2026-12-01", "Topic 10"), entry("2026-12-09", "Final exam", "final")])).toEqual({ date: "2026-12-09", assumed: false });
    expect(finalExam([])).toBeNull();
  });
});

describe("buildPlan", () => {
  const entries = [entry("2026-09-10", "Topic 1: Risk and Return (ch. 5 and 6), covering a lot"), entry("2026-09-17", "Topic 2: Portfolio Selection"), entry("2026-10-01", "Midterm Exam", "test")];
  const plan = buildPlan(entries, "2026-10-15", { studyDays: EVERY_DAY, minutesPerDay: 120, hasProblems: (_, i) => i === 0 });
  const dates = (id: string) => plan.find((t) => t.id === id)?.date;

  test("spaces each class: next day, practice, a week on, three weeks on", () => {
    expect(dates("2026-09-10:learn:0")).toBe("2026-09-11");
    expect(dates("2026-09-10:practice:0")).toBe("2026-09-13");
    expect(dates("2026-09-10:review:1")).toBe("2026-09-17");
    expect(dates("2026-09-10:review:2")).toBe("2026-10-01");
    expect(plan.find((t) => t.id === "2026-09-10:learn:0")!.title).toBe("First pass: Topic 1: Risk and Return");
    expect(plan.some((t) => t.id === "2026-09-17:practice:0")).toBe(false);
  });

  test("rehearses before every test and before the final", () => {
    expect(dates("2026-10-01:mock:0")).toBe("2026-09-24");
    expect(dates("2026-10-01:weak-spots:0")).toBe("2026-09-28");
    expect(dates("2026-10-01:wind-down:0")).toBe("2026-09-30");
    expect(dates("2026-10-15:mock:0")).toBe("2026-10-08");
    expect(dates("2026-10-15:wind-down:0")).toBe("2026-10-14");
  });

  test("plans nothing on or after the final", () => {
    expect(plan.every((t) => t.date < "2026-10-15")).toBe(true);
    const late = buildPlan([entry("2026-10-10", "Topic 9")], "2026-10-15", { studyDays: EVERY_DAY, minutesPerDay: 120 });
    expect(late.some((t) => t.id === "2026-10-10:review:2")).toBe(true);
    expect(late.every((t) => t.date <= "2026-10-14")).toBe(true);
  });

  test("uses only the chosen study days, moving rehearsals earlier and the rest later", () => {
    // 2026-09-11 is a Friday; weekends only.
    const weekends = buildPlan(entries, "2026-10-15", { studyDays: [0, 6], minutesPerDay: 120 });
    const day = (id: string) => new Date(`${weekends.find((t) => t.id === id)!.date}T00:00:00Z`).getUTCDay();
    expect(weekends.find((t) => t.id === "2026-09-10:learn:0")!.date).toBe("2026-09-12");
    expect([0, 6]).toContain(day("2026-10-01:mock:0"));
    expect(weekends.find((t) => t.id === "2026-10-01:mock:0")!.date <= "2026-09-24").toBe(true);
    // The evening before a test is kept even on a day off.
    expect(weekends.find((t) => t.id === "2026-10-01:wind-down:0")!.date).toBe("2026-09-30");
  });

  test("spills to the next study day when a day is full", () => {
    const tight = buildPlan([entry("2026-09-10", "Topic 1"), entry("2026-09-10", "Topic 1b")], "2026-12-01", { studyDays: EVERY_DAY, minutesPerDay: 30 });
    const firstPasses = tight.filter((t) => t.kind === "learn").map((t) => t.date).sort();
    expect(firstPasses).toEqual(["2026-09-11", "2026-09-12"]);
  });

  test("groups tasks by the week they fall in, Monday first", () => {
    expect(weekStart("2026-09-13")).toBe("2026-09-07");
    expect(weekStart("2026-09-14")).toBe("2026-09-14");
    const weeks = byWeek(plan);
    expect(weeks[0].start).toBe("2026-09-07");
    expect(weeks.every((w) => w.tasks.every((t) => weekStart(t.date) === w.start))).toBe(true);
  });

  test("date helpers", () => {
    expect(addDays("2026-12-29", 7)).toBe("2027-01-05");
    expect(daysBetween("2026-10-01", "2026-10-15")).toBe(14);
    expect(shortTopic("Topic 5 Capital Structure Ch. 16")).toBe("Topic 5 Capital Structure");
  });
});

describe("unitForEntry", () => {
  const unit = (id: string, label: string, order: number): Unit => ({ id, label, aliases: [], order });
  const nodes = [unit("n1", "Node 1 - Risk, Return & Utility", 1), unit("n2", "Node 2 - Portfolio Selection", 2), unit("n5", "Node 5 - Options", 5)];
  const chapters = [unit("c1", "Chapter 1", 1), unit("c7", "Chapter 7", 7), unit("c10", "Chapter 10", 10)];

  test("matches a numbered topic to the unit with that number", () => {
    expect(unitForEntry({ title: "Topic 2: Portfolio Selection (ch. 7)", chapters: [7] }, nodes)).toBe("n2");
    expect(unitForEntry({ title: "Topic 5 cont'd, covering Black-Scholes", chapters: [] }, nodes)).toBe("n5");
  });

  test("matches by chapter when the units are chapters", () => {
    expect(unitForEntry({ title: "Topic 2: Portfolio Selection (ch. 7)", chapters: [7] }, chapters)).toBe("c7");
    expect(unitForEntry({ title: "Experimentation Ch. 10", chapters: [10] }, chapters)).toBe("c10");
  });

  test("falls back to shared words, and gives up when nothing fits", () => {
    expect(unitForEntry({ title: "Options and applications: types of options", chapters: [] }, [unit("a", "Bonds & Duration", 1), unit("b", "Options and Applications", 2)])).toBe("b");
    expect(unitForEntry({ title: "Guest speaker", chapters: [] }, nodes)).toBeNull();
    expect(unitForEntry({ title: "Topic 1", chapters: [] }, [])).toBeNull();
  });
});
