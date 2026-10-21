import { describe, expect, it } from "vitest";
import { scheduleAssessments, withScheduleDates } from "@/lib/schedule/assessments";
import { likelyOutlines, yearIn } from "@/lib/schedule/auto";
import { fromLines, isRealDate } from "@/lib/schedule/outline";
import { buildPlan } from "@/lib/schedule/plan";
import type { OutlineEntry } from "@/lib/schedule/outline";
import type { Assessment, Unit } from "@/lib/vault/types";

const unit = (n: number, name: string): Unit => ({ id: `u${n}`, label: `Topic ${n} - ${name}`, aliases: [], order: n });
const UNITS = [unit(1, "Time Value"), unit(2, "Bonds"), unit(3, "Stocks")];
const entry = (date: string, kind: OutlineEntry["kind"], title: string): OutlineEntry => ({ date, kind, title, chapters: [] });
const ENTRIES = [
  entry("2026-09-08", "class", "Topic 1: Time Value"),
  entry("2026-09-15", "class", "Topic 2: Bonds"),
  entry("2026-10-20", "test", "Midterm exam"),
  entry("2026-10-27", "class", "Topic 3: Stocks"),
];
const SCHEDULE = { entries: ENTRIES, finalDate: "2026-12-08", finalAssumed: true, confirmed: false };

describe("scheduleAssessments", () => {
  it("makes a midterm covering only the units taught before it", () => {
    const [midterm] = scheduleAssessments(SCHEDULE, UNITS);
    expect(midterm).toMatchObject({ type: "midterm", date: "2026-10-20", covers: ["u1", "u2"], cumulative: false });
  });

  it("adds a cumulative final and says when its date is a guess", () => {
    const final = scheduleAssessments(SCHEDULE, UNITS).at(-1)!;
    expect(final).toMatchObject({ type: "final", date: "2026-12-08", covers: ["u1", "u2", "u3"], cumulative: true });
    expect(final.label).toMatch(/assumed/);
    expect(scheduleAssessments({ ...SCHEDULE, finalAssumed: false }, UNITS).at(-1)!.label).toBe("Final exam");
  });

  it("numbers tests of the same kind and covers everything when there are no classes to go by", () => {
    const entries = [entry("2026-09-20", "test", "Quiz"), entry("2026-10-04", "test", "QUIZ")];
    const quizzes = scheduleAssessments({ ...SCHEDULE, entries, finalDate: null }, UNITS);
    expect(quizzes.map((q) => q.label)).toEqual(["Quiz 1", "Quiz 2"]);
    expect(quizzes[0].covers).toEqual(["u1", "u2", "u3"]);
    expect(new Set(quizzes.map((q) => q.id)).size).toBe(2);
  });

  it("covers a matching share of the units when classes cannot be matched to them", () => {
    const entries = [
      entry("2026-09-08", "class", "Introduction"), entry("2026-09-15", "test", "Quiz"),
      entry("2026-09-22", "class", "Surveys"), entry("2026-09-29", "class", "Sampling"),
    ];
    const [quiz] = scheduleAssessments({ ...SCHEDULE, entries, finalDate: null }, UNITS);
    expect(quiz.covers).toEqual(["u1"]);
  });

  it("uses a unit named after the test", () => {
    const units = [{ ...unit(1, "x"), id: "final", label: "Final" }, { ...unit(2, "x"), id: "mid", label: "Midterm" }];
    expect(scheduleAssessments(SCHEDULE, units)[0].covers).toEqual(["mid"]);
  });

  it("drops a guessed final that falls on the day of a test", () => {
    const entries = [entry("2026-11-10", "class", "Topic 3: Stocks"), entry("2026-11-17", "test", "Quiz 3")];
    const made = scheduleAssessments({ ...SCHEDULE, entries, finalDate: "2026-11-17", finalAssumed: true }, UNITS);
    expect(made.map((a) => a.type)).toEqual(["quiz"]);
  });
});

describe("withScheduleDates", () => {
  const declared = (over: Partial<Assessment>): Assessment => ({
    id: "mid", label: "Midterm", type: "midterm", date: null, format: [], covers: ["u1"], cumulative: false, emphasis: [], practice: [], ...over,
  });

  it("uses the outline's tests when study.yml lists none", () => {
    expect(withScheduleDates([], SCHEDULE, UNITS).map((a) => a.type)).toEqual(["midterm", "final"]);
  });

  it("fills a missing date from the matching test and keeps everything else", () => {
    const [filled] = withScheduleDates([declared({})], SCHEDULE, UNITS);
    expect(filled).toMatchObject({ id: "mid", date: "2026-10-20", covers: ["u1"] });
  });

  it("never overrides a date the owner wrote, and does nothing without a schedule", () => {
    const own = [declared({ date: "2026-10-01" })];
    expect(withScheduleDates(own, SCHEDULE, UNITS)[0].date).toBe("2026-10-01");
    expect(withScheduleDates(own, null, UNITS)).toBe(own);
  });
});

describe("likelyOutlines", () => {
  it("prefers files named as an outline or syllabus and ignores other PDFs", () => {
    expect(likelyOutlines(["raw/Chapter 1.pdf", "raw/FIN 101 Course Outline.pdf", "raw/Class schedule.pdf"]))
      .toEqual(["raw/FIN 101 Course Outline.pdf", "raw/Class schedule.pdf"]);
    expect(likelyOutlines(["raw/Textbook.pdf"])).toEqual([]);
  });
});

describe("review fixes", () => {
  it("accepts only dates that exist", () => {
    expect(isRealDate("2026-02-28")).toBe(true);
    expect(isRealDate("2026-02-31")).toBe(false);
    expect(isRealDate("2026-10-45")).toBe(false);
    expect(fromLines("2026-02-31 | Topic 1: Bonds\n2026-03-03 | Topic 2: Stocks")).toHaveLength(1);
  });

  it("cuts an over-long line down instead of failing to save", () => {
    const [only] = fromLines(`2026-03-03 | ${"word ".repeat(400)}`);
    expect(only.title.length).toBeLessThanOrEqual(600);
  });

  it("reads the year an outline is for", () => {
    expect(yearIn("FIN 101 Winter 2027. Classes start Jan 12, 2027. Revised 2026.", 2026)).toBe(2027);
    expect(yearIn("No year here", 2026)).toBe(2026);
    expect(yearIn("Founded 1974. ISBN 2099.", 2026)).toBe(2026);
    // Textbook editions and citations must not pull the year back.
    expect(yearIn("Text (2024), article (2024), revised 2025, classes in 2026", 2026)).toBe(2026);
  });

  it("gives two classes on one day separate task ids, and two tests on one day separate assessments", () => {
    const entries = [entry("2026-09-08", "class", "Topic 1: Lecture"), entry("2026-09-08", "class", "Topic 1: Lab"), entry("2026-10-20", "test", "Quiz"), entry("2026-10-20", "test", "Midterm")];
    const ids = buildPlan(entries, "2026-12-08", { studyDays: [0, 1, 2, 3, 4, 5, 6], minutesPerDay: 60 }).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const made = scheduleAssessments({ ...SCHEDULE, entries }, UNITS).map((a) => a.id);
    expect(new Set(made).size).toBe(made.length);
  });
});
