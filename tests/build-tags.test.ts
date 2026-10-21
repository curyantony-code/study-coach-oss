import { describe, expect, it } from "vitest";
import { cleanCourse, courseOf, kindOf, tagFile, titleOf, unitFromInput, unitOf } from "@/lib/build/tags";

const facts = (name: string, text = "", pages = 0) => ({ name, text, pages });

describe("courseOf", () => {
  it("reads a course code from a file name however it is spaced", () => {
    expect(courseOf("FIN 101 - Chapter 07 - Optimal Risky Portfolios.pdf", "")).toBe("FIN 101");
    expect(courseOf("bus100 wk10(1) (1).pdf", "")).toBe("BUS 100");
    expect(courseOf("prepco-free-midterm-1-crash-course-bus-100-booklet.pdf", "")).toBe("BUS 100");
    expect(courseOf("FIN101_Part1_Rationale.docx", "")).toBe("FIN 101");
  });

  it("falls back to the text, and ignores words that are not courses", () => {
    expect(courseOf("week 11 (2).pdf", "See PAGE 112 and ROOM 204.\nMKTG 201 Marketing Research")).toBe("MKTG 201");
    expect(courseOf("week 11 (2).pdf", "Fall 2026, page 3")).toBeNull();
  });

  it("reads the course from the folder, and ignores a single passing mention in the text", () => {
    expect(courseOf("Finance Basics 2e - Problem Sets.pdf", "", [], "FIN 101 Teacher/raw/Practice & Solutions")).toBe("FIN 101");
    const deep = "x".repeat(500);
    expect(courseOf("book.pdf", `${deep} Library of Congress DDC 658 and once MKTG 201`)).toBeNull();
    expect(courseOf("book.pdf", `${deep} once MKTG 201`, ["MKTG 201"])).toBe("MKTG 201");
    expect(courseOf("MKTG 401A case.pdf", "")).toBe("MKTG 401");
  });

  it("lets the name outweigh a passing mention in the text", () => {
    expect(courseOf("MKTG 401 case.pdf", "Prerequisite: MKTG 201. MKTG 201 students may recall MKTG 201.")).toBe("MKTG 401");
  });
});

describe("unitOf", () => {
  it("finds chapters, weeks, lectures and nodes in a name", () => {
    expect(unitOf("Bodie10ce_SM_Ch10.docx", "")).toEqual({ key: "ch10", label: "Chapter 10" });
    expect(unitOf("BUS100 wk 1 intro.pdf", "")).toEqual({ key: "wk1", label: "Week 1" });
    expect(unitOf("FIN 101 - Node 2 - Portfolio Selection.pptx", "")).toEqual({ key: "node2", label: "Node 2" });
    expect(unitOf("Lecture_05.pdf", "")).toEqual({ key: "lec5", label: "Lecture 5" });
  });

  it("does not read a course number or a year as a unit", () => {
    expect(unitOf("FIN 101 - Formula Sheet.pdf", "")).toBeNull();
    expect(unitOf("class 2026 photos.pdf", "")).toBeNull();
  });

  it("falls back to the first lines of the text, but not for a long file that covers many chapters", () => {
    expect(unitOf("slides.pdf", "Chapter 3\nHow Securities Are Traded", 30)).toEqual({ key: "ch3", label: "Chapter 3" });
    expect(unitOf("booklet.pdf", "Chapter 1\nIntroduction", 140)).toBeNull();
  });
});

describe("kindOf", () => {
  it.each([
    ["FIN 101 - Course Outline (Sec A, Monday).pdf", "outline"],
    ["Bodie11ce_SM_Ch07_FINAL.docx", "solutions"],
    ["prepco-free-midterm-2-final-mock-exam-bus-100-midterm-2-mock-exam-booklet.pdf", "exam"],
    ["prepco-free-midterm-1-crash-course-bus-100-midterm-1-crash-course-booklet.pdf", "notes"],
    ["Finance Basics 2e - Problem Sets.pdf", "problems"],
    ["FIN 201 - Additional TVM Exercises.pdf", "problems"],
    ["Finance Basics 2nd Edition -- Zvi Bodie.pdf", "textbook"],
    ["FIN 101 - Node 3 - CAPM.pptx", "slides"],
    ["FIN 101 - Formula Sheet.pdf", "notes"],
    ["Midterm F24.pdf", "exam"],
  ])("%s is %s", (name, kind) => {
    expect(kindOf(facts(name))).toEqual({ kind, sure: true });
  });

  it("calls a very long PDF a textbook and recognises an outline by its wording", () => {
    expect(kindOf(facts("scan0001.pdf", "x", 420))).toEqual({ kind: "textbook", sure: true });
    expect(kindOf(facts("doc.pdf", "Instructor: A. Person\nOffice hours: Tue\nGrading: midterm 30%\nAcademic integrity", 9)).kind).toBe("outline");
  });

  it("only guesses when the name says nothing", () => {
    expect(kindOf(facts("FIN 101 - Chapter 01 - The Investment Environment.pdf", "word ".repeat(400), 30))).toEqual({ kind: "slides", sure: false });
    expect(kindOf(facts("thing.pdf", "word ".repeat(8000), 10))).toEqual({ kind: "notes", sure: false });
    expect(kindOf(facts("data.xlsx"))).toEqual({ kind: "other", sure: false });
  });

  it("takes the kind from the folder the student filed it in, nearest folder first", () => {
    expect(kindOf({ name: "FIN 101 - Chapter 01 - The Investment Environment.pdf", text: "word ".repeat(400), pages: 30, folder: "FIN 101 Teacher/raw/FIN 101 - Chapter Breakdown - Textbook" })).toEqual({ kind: "textbook", sure: true });
    expect(kindOf({ name: "Bodie.docx", text: "", pages: 0, folder: "raw/Practice & Solutions/Solution Manual - 11th Canadian Edition" })).toEqual({ kind: "solutions", sure: true });
    expect(kindOf({ name: "thing.pdf", text: "x", pages: 1, folder: "Lecture Notes/pdf/a/b" }).sure).toBe(false);
  });

  it("never calls a file an outline because of its folder", () => {
    expect(kindOf({ name: "map.png", text: "", pages: 0, folder: "Course Outline" })).toEqual({ kind: "other", sure: false });
  });
});

describe("titleOf", () => {
  it("drops the course code, the unit number and clutter", () => {
    expect(titleOf("FIN 101 - Chapter 01 - The Investment Environment.pdf", "", "FIN 101")).toBe("The Investment Environment");
    expect(titleOf("FIN 101 - Node 2 - Portfolio Selection.pptx", "", "FIN 101")).toBe("Portfolio Selection");
  });

  it("uses the first heading-like line when the name is only a number", () => {
    expect(titleOf("bus100 wk3.pdf", "\n12\nBUS 100:\nMotivation at Work\nmore", "BUS 100")).toBe("Motivation at Work");
    expect(titleOf("bus100 wk4.pdf", "BUS 100: Working in Teams\n", "BUS 100")).toBe("Working in Teams");
  });

  it("passes over a line that ends mid-phrase, and a title other units already use", () => {
    const text = "BUS 100: Working in Teams &\nOrganizations and Work\nLegal Requirements at Work\n";
    expect(titleOf("bus100 wk3.pdf", text, "BUS 100")).toBe("Organizations and Work");
    expect(titleOf("bus100 wk3.pdf", text, "BUS 100", ["organizations and work"])).toBe("Legal Requirements at Work");
  });
});

describe("tagFile, unitFromInput, cleanCourse", () => {
  it("tags a file in one go", () => {
    expect(tagFile(facts("FIN 101 - Node 3 - CAPM.pptx"))).toEqual({ course: "FIN 101", kind: "slides", kindSure: true, unit: { key: "node3", label: "Node 3" }, title: "CAPM" });
  });

  it("accepts a typed unit as a number or as a name", () => {
    expect(unitFromInput(" chapter 7 ")).toEqual({ key: "ch7", label: "Chapter 7" });
    expect(unitFromInput("Risk and return")).toEqual({ key: "risk-and-return", label: "Risk and return" });
    expect(unitFromInput("  ")).toBeNull();
  });

  it("lays a typed course code out the standard way", () => {
    expect(cleanCourse("fin101")).toBe("FIN 101");
    expect(cleanCourse("not a course")).toBeNull();
  });
});
