import { describe, expect, it } from "vitest";
import { insidePath } from "@/lib/master/go";
import { courseCode, HEAVY_DAY_MINUTES, masterView, MAX_WEEKS, type MasterCourse, type MasterTask, type MasterTest } from "@/lib/master/overview";

const TODAY = "2026-10-14"; // a Wednesday; its week starts Monday 2026-10-12
const task = (courseId: string, date: string, minutes = 30, done = false, id = `${courseId}-${date}-${minutes}`): MasterTask => ({ courseId, id, date, kind: "learn", title: `Task ${id}`, minutes, done, href: "/study" });
const test = (courseId: string, date: string, label = "Midterm", readiness: number | null = 0.5): MasterTest => ({ courseId, label, date, assumed: false, readiness });
const course = (id: string, tasks: MasterTask[], tests: MasterTest[] = []): MasterCourse => ({
  id, name: id, code: id, missing: null, unchecked: false, tasks, tests,
  topics: [{ courseId: id, unitId: "u1", label: "Topic 1", cards: 10, studied: 4, mastery: 0.4, taughtOn: null, nextTest: null }],
});

describe("masterView", () => {
  const fina = course("FINA", [task("FINA", "2026-10-05"), task("FINA", "2026-10-13"), task("FINA", "2026-10-14", 60), task("FINA", "2026-10-16", 45, true), task("FINA", "2026-11-02")], [test("FINA", "2026-10-22"), test("FINA", "2026-12-10", "Final exam")]);
  const mark = course("MARK", [task("MARK", "2026-10-14", 150), task("MARK", "2026-10-20")], [test("MARK", "2026-10-16", "Quiz 2")]);
  const view = masterView([fina, mark], TODAY);

  it("puts every course's tasks on one calendar, a day at a time", () => {
    expect(view.days).toHaveLength(7);
    expect(view.days[0].date).toBe(TODAY);
    // Today carries Tuesday's unfinished task from this week as well as today's own.
    expect(view.days[0].tasks.map((t) => t.date)).toEqual(["2026-10-13", "2026-10-14", "2026-10-14"]);
    expect(view.days[0].minutes).toBe(30 + 60 + 150);
    expect(view.days[0].heavy).toBe(30 + 60 + 150 > HEAVY_DAY_MINUTES);
    expect(view.days[2].tests.map((t) => t.label)).toEqual(["Quiz 2"]);
    // A finished task is shown but does not count toward the day's time.
    expect(view.days[2].minutes).toBe(0);
  });

  it("keeps tasks from before this week apart as overdue", () => {
    expect(view.overdue.map((t) => t.date)).toEqual(["2026-10-05"]);
  });

  it("lays out every week to the last test, with each course's share", () => {
    expect(view.weeks[0].start).toBe("2026-10-12");
    expect(view.weeks.at(-1)!.start).toBe("2026-12-07");
    expect(view.weeks[0].byCourse).toEqual([{ courseId: "FINA", minutes: 90, tasks: 2 }, { courseId: "MARK", minutes: 150, tasks: 1 }]);
    expect(view.weeks[1].tests.map((t) => t.courseId)).toEqual(["FINA"]);
    expect(view.endDate).toBe("2026-12-10");
  });

  it("sums up what is left in each course and overall", () => {
    const [f, m] = view.summaries;
    expect(f).toMatchObject({ tasksLeft: 3, testsLeft: 2, overdue: 1, cards: 10, studied: 4 });
    expect(f.nextTest?.date).toBe("2026-10-22");
    expect(m).toMatchObject({ tasksLeft: 2, testsLeft: 1 });
    expect(view.totals).toMatchObject({ tasksLeft: 5, testsLeft: 3, cards: 20, studied: 8 });
  });

  it("copes with no courses and with a course that has no plan", () => {
    expect(masterView([], TODAY)).toMatchObject({ endDate: null, overdue: [], weeks: [] });
    expect(masterView([course("EMPTY", [])], TODAY).weeks).toEqual([]);
  });
});

describe("courseCode", () => {
  it("finds the course code in a vault's name", () => {
    expect(courseCode("FIN 101 Teacher")).toBe("FIN 101");
    expect(courseCode("op_mktg401")).toBe("MKTG 401");
    expect(courseCode("Bus 100 Teacher")).toBe("BUS 100");
    expect(courseCode("Anything", "ECON 201")).toBe("ECON 201");
    expect(courseCode("My very long notebook name")).toBe("My very long…");
  });
});

describe("review fixes", () => {
  it("ignores a test dated years away when drawing the weeks", () => {
    const view = masterView([course("FINA", [task("FINA", "2026-10-20")], [test("FINA", "2099-01-01")])], TODAY);
    expect(view.weeks.length).toBeLessThanOrEqual(MAX_WEEKS);
    expect(view.weeks.at(-1)!.start).toBe("2026-10-19");
  });

  it("only follows addresses inside the app", () => {
    expect(insidePath("/schedule")).toBe("/schedule");
    expect(insidePath("/study/session?scope=unit%3Au1&mode=smart")).toBe("/study/session?scope=unit%3Au1&mode=smart");
    expect(insidePath("/problems#ch7")).toBe("/problems#ch7");
    for (const bad of ["//evil.example/x", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "https://evil.example", "javascript:alert(1)", "evil", "", null, undefined]) {
      expect(insidePath(bad as string), String(bad)).toBe("/");
    }
  });
});
