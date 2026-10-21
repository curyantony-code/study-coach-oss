import { describe, expect, test } from "vitest";
import { chaptersIn, classify, fromLines, parseOutlineSchedule, toLines } from "@/lib/schedule/outline";

const TOP_ALIGNED = `
Course policies mention that Mon Nov 16 is a deadline for something unrelated.

 Class Schedule

 Week      Date             Readings/Activity                                   Related Chapters
 1         Tue Sep 8        Course Introduction                                 Ch. 5
                            Topic 1 The Time Value of Money
 2         Tue Sep 15       Topic 2 Net Present Value                           Ch. 4
                                                                                Ch. 7
 3         Tue Sep 22       Topic 2 cont'd
           Sat Oct 10       to Fri Oct 16 – Reading week
 6         Tue Oct 20       2.5-hour Midterm Exam                               On Topic 1,2
 7         Tue Oct 27       Topic 5 Capital Structure                           Ch. 16
 Final     Wed Dec 9 –         3-hour Final Exam
 Exam      Tue Dec 22          Time and location scheduled by the exam office (Final Exam Period)

Please note that this schedule is tentative.
`;

const CENTRED = `
Weekly Schedule

 Session     Date              Topic / Activity
                               Topic 1: Risk and Return (ch. 5 and 6),
    1        Sept 10           covering expected return;
                               risk aversion
                               Topic 2: Portfolio Selection (ch. 7), covering one
    2        Sept 17           risky asset

    3        Sept 24           Topic 2 cont'd. Project Part 1 due (6 points).
    4        Jan 7             Topic 3: The CAPM (ch. 9)
`;

describe("parseOutlineSchedule", () => {
  test("reads a table whose cells start on the dated line", () => {
    const entries = parseOutlineSchedule(TOP_ALIGNED, 2026);
    expect(entries.map((e) => [e.date, e.kind])).toEqual([
      ["2026-09-08", "class"],
      ["2026-09-15", "class"],
      ["2026-09-22", "class"],
      ["2026-10-10", "break"],
      ["2026-10-20", "test"],
      ["2026-10-27", "class"],
      ["2026-12-09", "final"],
    ]);
    expect(entries[0].title).toBe("Course Introduction Ch. 5 Topic 1 The Time Value of Money");
    expect(entries[1].chapters).toEqual([4, 7]);
    expect(entries[6].title).toBe("Final exam (exam period runs to 2026-12-22)");
  });

  test("reads a table whose cells are centred on the date, and rolls into the next year", () => {
    const entries = parseOutlineSchedule(CENTRED, 2026);
    expect(entries.map((e) => [e.date, e.kind, e.chapters])).toEqual([
      ["2026-09-10", "class", [5, 6]],
      ["2026-09-17", "class", [7]],
      ["2026-09-24", "class", []],
      ["2027-01-07", "class", [9]],
    ]);
    expect(entries[0].title).toBe("Topic 1: Risk and Return (ch. 5 and 6), covering expected return; risk aversion");
    expect(entries[1].title).toBe("Topic 2: Portfolio Selection (ch. 7), covering one risky asset");
  });

  test("finds nothing in text with no schedule table", () => {
    expect(parseOutlineSchedule("Office hours are on Sept 10. The fee deadline is Oct 2.", 2026)).toEqual([]);
  });
});

describe("classify and chaptersIn", () => {
  test("tells tests, breaks and deadlines from classes", () => {
    expect(classify("Quiz 1 – Weeks 1, 2, 3 Project Workshop")).toBe("test");
    expect(classify("TEST 2")).toBe("test");
    expect(classify("Sample Design. Experimentation and Test Markets")).toBe("class");
    expect(classify("READING WEEK")).toBe("break");
    expect(classify("Due: Project Reports (all groups)")).toBe("deadline");
    expect(classify("Topic 2 cont'd. Project Part 1 due (6 points).")).toBe("class");
    expect(classify("3-hour Final Exam")).toBe("final");
  });

  test("reads chapter numbers in the usual ways they are written", () => {
    expect(chaptersIn("(ch. 5 and 6)")).toEqual([5, 6]);
    expect(chaptersIn("Chapters 10 & 11")).toEqual([10, 11]);
    expect(chaptersIn("ch. 20.1 to 20.4, 21.1, 21.3")).toEqual([20, 21]);
    expect(chaptersIn("covers 14.4, 15.1 to 15.5")).toEqual([14, 15]);
    expect(chaptersIn("Topic 3 The CAPM")).toEqual([]);
  });
});

describe("the editable list", () => {
  test("survives a round trip and accepts corrections", () => {
    const entries = parseOutlineSchedule(TOP_ALIGNED, 2026);
    expect(fromLines(toLines(entries))).toEqual(entries);
    const edited = fromLines("2026-09-08 | Topic 1 (ch 5)\nnot a line\n2026-10-20 | TEST | Midterm\n2026-12-15 | FINAL | Final exam");
    expect(edited.map((e) => [e.date, e.kind, e.title])).toEqual([
      ["2026-09-08", "class", "Topic 1 (ch 5)"],
      ["2026-10-20", "test", "Midterm"],
      ["2026-12-15", "final", "Final exam"],
    ]);
  });
});
