import { describe, expect, test } from "vitest";
import { acceptPolish, briefUserPrompt, codeBrief, composeQuestion, mergeBriefs, readBrief, resultsNamed } from "@/lib/ai/complete-question";
import { openDb } from "@/lib/db/client";
import { basisOf, COMPLETED_SOURCE, CONDENSED_SOURCE, deleteFix, getFixes, getQuestionStyle, needsWritingOut, saveFix, setQuestionStyle, withCompletedQuestions } from "@/lib/problems/fixes";
import type { Card } from "@/lib/vault/types";

const question = "Compare FV of \\$1,000 at a 12% APR compounded annually, quarterly, daily and continuously.";
const solution = "EAR = 12.00%, 12.55%, 12.74%, 12.75%. FV after 1 year: 1,120.00 / 1,125.51; after 20 years: 9,646.29 / 10,640.89.";

describe("readBrief: what the small model may contribute", () => {
  const item = { heading: "T1 L2", question, solution, formula: null };

  test("keeps a missing given and what to find", () => {
    const brief = readBrief(item, '{"givens":["horizon of 20 years"],"find":["EAR", "FV after 1 year", "FV after 20 years"]}');
    expect(brief).toEqual({ givens: ["horizon of 20 years"], find: ["EAR", "FV after 1 year", "FV after 20 years"] });
  });

  test("drops givens the question already states, invented numbers, and computed results", () => {
    const brief = readBrief(item, '{"givens":["\\$1,000 invested","12% APR","horizon of 35 years","EAR of 12.55%","FV of 1,120.00"],"find":["FV after 20 years = 9,646.29","FV after 20 years"]}');
    expect(brief!.givens).toEqual([]);
    // The value is stripped from a "find" item rather than shown.
    expect(brief!.find).toEqual(["FV after 20 years"]);
  });

  test("drops phrases that are not about this problem, however plausible", () => {
    const brief = readBrief(item, '{"givens":["dividend payout ratio of 20%"],"find":["price of the bond", "FV after 20 years", "?22"]}');
    expect(brief).toEqual({ givens: [], find: ["FV after 20 years"] });
  });

  test("reads JSON wrapped in prose, and an empty brief is a valid answer", () => {
    expect(readBrief(item, 'Here you go: {"givens":[],"find":[]} Done.')).toEqual({ givens: [], find: [] });
    expect(readBrief(item, "I cannot do that.")).toBeNull();
    expect(readBrief(item, '{"answer": 42}')).toBeNull();
  });

  test("values borrowed from the previous question count as givens", () => {
    const leaning = { heading: "TVM 15", question: "Same loan, but repay \\$10,000 principal per year plus interest on the balance. Interest saved?", solution: "Interest = 4,000 + 3,200 + 2,400 + 1,600 + 800 = 12,000. Saved 614.11.", formula: null, previous: "A \\$50,000 loan at 8% is repaid over 5 years in level payments." };
    const brief = readBrief(leaning, '{"givens":["loan of \\$50,000","interest rate of 8%","term of 5 years","total interest 12,000"],"find":["interest saved"]}');
    expect(brief!.givens).toEqual(["loan of \\$50,000", "interest rate of 8%", "term of 5 years"]);
  });

  test("the student's note reaches the small model and its numbers are allowed", () => {
    const withNote = { ...item, feedback: "It should also ask about 35 years." };
    expect(briefUserPrompt(withNote)).toContain("<student_says>\nIt should also ask about 35 years.\n</student_says>");
    expect(readBrief(withNote, '{"givens":["horizon of 35 years"],"find":[]}')!.givens).toEqual(["horizon of 35 years"]);
  });
});

describe("code-only completion", () => {
  test("reads what a solution computes from its own result lines", () => {
    expect(resultsNamed({ question, solution })).toEqual(["EAR", "FV after 1 year", "after 20 years"]);
    const eac = { question: "Cadillac: \\$4,000 plus \\$100/yr for 10 years. Cheap: \\$1,000 plus \\$500/yr for 5 years. $r=10\\%$.", solution: "With r = 10%: PV of Cadillac costs = 4,000 + 100 x 6.1446 = 4,614.46; EAC = 4,614.46 / 6.1446 = 750.98. Choose Cadillac." };
    // "r = 10%" is restated from the question: a given, not a result.
    expect(resultsNamed(eac)).toEqual(["PV of Cadillac costs", "EAC"]);
  });

  test("falls back to the example's name when the solution labels nothing", () => {
    expect(codeBrief({ heading: "TVM 04 - Years to Double at 18 Percent", question: "TVM 04 - Years to Double at 18 Percent", solution: "Using the rule of 72, about four years.", formula: null }).find).toEqual(["Years to Double at 18 Percent"]);
  });

  test("a list of givens gets a Find line; a question that already asks is left alone", () => {
    const givensOnly = { question: "Cadillac: \\$4,000 plus \\$100/yr for 10 years. Cheap: \\$1,000 plus \\$500/yr for 5 years. $r=10\\%$." };
    expect(composeQuestion(givensOnly, { givens: [], find: ["PV of Cadillac costs", "EAC"] })).toBe(`${givensOnly.question} Find: PV of Cadillac costs; EAC.`);
    expect(composeQuestion({ question: "Find the PV of \\$100 a year for 10 years at 5%." }, { givens: [], find: ["PV"] })).toBeNull();
    expect(composeQuestion({ question }, { givens: [], find: [] })).toBeNull();
  });

  test("a missing given brings its Find line with it", () => {
    expect(composeQuestion({ question }, { givens: ["a time frame of 20 years"], find: ["EAR", "FV after 1 year", "after 20 years"] })).toBe(
      `${question} Also given: a time frame of 20 years. Find: EAR; FV after 1 year; after 20 years.`
    );
  });

  test("a question that leans on the previous one is given it word for word", () => {
    const composed = composeQuestion({ question: "Same loan, but repay \\$10,000 principal per year. Interest saved?", previous: "A \\$50,000 loan at 8% is repaid over 5 years" }, { givens: [], find: [] });
    expect(composed).toBe("The previous question was: “A \\$50,000 loan at 8% is repaid over 5 years.” Now: Same loan, but repay \\$10,000 principal per year. Interest saved?");
  });

  test("briefs merge without repeats, code's items first", () => {
    expect(mergeBriefs({ givens: [], find: ["EAC"] }, { givens: ["horizon of 20 years"], find: ["eac", "which is cheaper"] })).toEqual({ givens: ["horizon of 20 years"], find: ["EAC", "which is cheaper"] });
  });
});

describe("acceptPolish: the larger model may only reword", () => {
  const composed = `${question} Also given: investment horizon of 20 years. Find: FV after 1 year; FV after 20 years.`;

  test("accepts a rewording with exactly the same numbers", () => {
    const polished = "You invest \\$1,000 at a 12% APR. Find the future value after 1 year and after 20 years under annual, quarterly, daily and continuous compounding.";
    expect(acceptPolish(composed, polished)).toBe(polished);
  });

  test("rejects a rewording that adds, drops or changes a number, or stops asking", () => {
    expect(acceptPolish(composed, "You invest \\$1,000 at a 12% APR. Find the future value after 1 year and after 25 years.")).toBeNull();
    expect(acceptPolish(composed, "You invest \\$1,000 at a 12% APR. Find the future value after 20 years.")).toBeNull();
    expect(acceptPolish(composed, "You invest \\$1,000 at a 12% APR for 1 year and 20 years, which gives 1,120.00.")).toBeNull();
    expect(acceptPolish(composed, "\\$1,000 at a 12% APR, 1 year, 20 years.")).toBeNull();
    expect(acceptPolish(composed, "")).toBeNull();
  });
});

describe("completed questions", () => {
  const card = (front: string, back: string): Card => ({ id: "c1", nodeId: "n", front, back, type: "problem", unitIds: [], tags: [], problem: { heading: "T1 L2 - Compounding", formula: null, note: null } });

  test("are shown in place of the note's wording, which stays available", () => {
    const db = openDb(":memory:");
    saveFix(db, "v1", "c1", { text: "The full question.", condensed: "Short. Find: FV.", basis: basisOf(question, solution) }, new Date("2026-10-09T12:00:00Z"));
    const [shown] = withCompletedQuestions([card(question, solution)], getFixes(db, "v1"));
    expect(shown.front).toBe("The full question.");
    expect(shown.problem!.original).toEqual({ source: COMPLETED_SOURCE, noteVersion: question, uncertain: false, completed: true });
    expect(shown.problem!.versions).toEqual({ full: "The full question.", condensed: "Short. Find: FV.", note: question });
    expect(getFixes(db, "other").size).toBe(0);
  });

  test("a rewrite made from an older version of the note is ignored, and can be removed", () => {
    const db = openDb(":memory:");
    saveFix(db, "v1", "c1", { text: "The full question.", condensed: "Short. Find: FV.", basis: basisOf(question, solution) }, new Date());
    const edited = card(`${question} For 5 years.`, solution);
    expect(withCompletedQuestions([edited], getFixes(db, "v1"))[0].front).toBe(edited.front);
    deleteFix(db, "v1", "c1");
    expect(getFixes(db, "v1").size).toBe(0);
  });

  test("a card already showing the textbook's wording is left alone", () => {
    const withTextbook: Card = { ...card("Textbook wording.", solution), problem: { heading: "Ch7-P6", formula: null, note: null, original: { source: "Book.pdf", noteVersion: question, uncertain: false } } };
    const fixes = new Map([["c1", { text: "AI wording.", condensed: null, basis: basisOf("Textbook wording.", solution) }]]);
    expect(withCompletedQuestions([withTextbook], fixes)[0].front).toBe("Textbook wording.");
  });
});

describe("the wording a student chooses", () => {
  const card: Card = { id: "c1", nodeId: "n", front: question, back: solution, type: "problem", unitIds: [], tags: [], problem: { heading: "T1 L2 - Compounding", formula: null, note: null } };
  const fixes = (condensed: string | null) => new Map([["c1", { text: "The full question.", condensed, basis: basisOf(question, solution) }]]);

  test("defaults to in full, and is remembered", () => {
    const db = openDb(":memory:");
    expect(getQuestionStyle(db)).toBe("full");
    setQuestionStyle(db, "condensed");
    expect(getQuestionStyle(db)).toBe("condensed");
  });

  test("condensed shows the short form, falling back to full when there is none", () => {
    const [short] = withCompletedQuestions([card], fixes("Short. Find: FV."), "condensed");
    expect(short.front).toBe("Short. Find: FV.");
    expect(short.problem!.original!.source).toBe(CONDENSED_SOURCE);
    expect(withCompletedQuestions([card], fixes(null), "condensed")[0].front).toBe("The full question.");
  });

  test("notes keeps the note's wording but still carries the other versions", () => {
    const [shown] = withCompletedQuestions([card], fixes("Short. Find: FV."), "notes");
    expect(shown.front).toBe(question);
    expect(shown.problem!.original).toBeUndefined();
    expect(shown.problem!.versions!.full).toBe("The full question.");
  });

  test("a problem needs writing out only while no version exists and no textbook wording is shown", () => {
    expect(needsWritingOut(card)).toBe(true);
    expect(needsWritingOut(withCompletedQuestions([card], fixes(null), "notes")[0])).toBe(false);
    expect(needsWritingOut({ ...card, problem: { ...card.problem!, original: { source: "Book", noteVersion: "x", uncertain: false } } })).toBe(false);
    expect(needsWritingOut({ ...card, type: "definition", problem: undefined })).toBe(false);
  });
});
