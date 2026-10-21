import { describe, expect, test } from "vitest";
import { parseProblemSets, textbookKey, tidyProblemText } from "@/lib/problems/textbook";

// A made-up textbook extract in the same layout as a real one: two chapters, page furniture,
// margin labels, wrapped lines, a shared data block, a table, and a CFA section.
const EXTRACT = `
PROBLEM SETS    1. Why do tides exist? Explain in
                   one paragraph.
                2. Which factors matter?
                   a. The moon.
                   b. The sun.
   E-INVESTMENTS EXERCISES
   Go to a site and look around.
     SOLUTIONS TO CONCEPT CHECKS
                  1. Because of gravity.
                  2. Both of them.
                  3. Neither.
Some summary text that is not a problem.

1. Which statement about harbours is true?                                                   PROB
    a. They are deep.
    b. They are shallow.
2. When building a pier, which proper-
   ties of wood matter? Explain.
The following data apply to Problems 3 through 5: A harbour master is considering two
boats. The details are as follows:
                                        Expected Speed                    Fuel Use

                        Sail boat (S)                         20%                                  30%
                        Motor boat (M)                        12                                   15
The correlation between them is .10.
3. What is the best mix of the two boats?
4. Tabulate the options. Use steps
   of 20%.
224   PART II   Boats and Harbours

                 5. Draw a line from the dock to the set of options. What does your graph show for the
                    expected speed of the best mix?
                 6. A question that stands alone.
                                                                              CHAPTER 2          Harbours   227
The following data apply to CFA Problems 1 through 2: An analyst studies a port.
                1. a. Is the port busy?
                   b. Is it profitable?
                2. Another committee member asked a question.
                3. A CFA question with no shared data.
   E-INVESTMENTS EXERCISES
   1. Visit a port website.
      SOLUTIONS TO CONCEPT CHECKS
                  1. Yes.
`;

describe("parseProblemSets", () => {
  const problems = parseProblemSets(EXTRACT);
  const get = (key: string) => problems.find((p) => textbookKey(p) === key)!;

  test("finds each chapter's problems and CFA problems, and nothing else", () => {
    expect(problems.map(textbookKey)).toEqual([
      "ch1-p1", "ch1-p2",
      "ch2-p1", "ch2-p2", "ch2-p3", "ch2-p4", "ch2-p5", "ch2-p6",
      "ch2-cfa1", "ch2-cfa2", "ch2-cfa3",
    ]);
  });

  test("answers to concept checks and web exercises are not problems", () => {
    const everything = problems.map((p) => p.text).join(" ");
    expect(everything).not.toMatch(/Because of gravity|Neither|Visit a port|look around|summary text/);
  });

  test("rejoins wrapped lines and words split across lines", () => {
    expect(get("ch1-p1").text).toBe("Why do tides exist? Explain in one paragraph.");
    expect(get("ch2-p2").text).toBe("When building a pier, which properties of wood matter? Explain.");
    expect(get("ch2-p4").text).toBe("Tabulate the options. Use steps of 20%.");
  });

  test("keeps lettered parts on their own lines and drops margin labels", () => {
    expect(get("ch2-p1").text).toBe("Which statement about harbours is true?\na. They are deep.\nb. They are shallow.");
    expect(get("ch2-cfa1").text).toBe("a. Is the port busy?\nb. Is it profitable?");
  });

  test("removes page headers and footers from the middle of a problem set", () => {
    expect(get("ch2-p4").text).not.toMatch(/PART II|Boats and Harbours/);
    expect(get("ch2-p5").text).toBe("Draw a line from the dock to the set of options. What does your graph show for the expected speed of the best mix?");
    expect(get("ch2-p6").text).toBe("A question that stands alone.");
  });

  test("attaches shared data to every problem in its range, and only those", () => {
    expect(get("ch2-p2").text).not.toMatch(/following data/);
    expect(get("ch2-p2").preamble).toBeNull();
    for (const key of ["ch2-p3", "ch2-p4", "ch2-p5"]) {
      expect(get(key).preamble).toMatch(/^The following data apply to Problems 3 through 5: A harbour master is considering two boats\. The details are as follows:/);
    }
    expect(get("ch2-p6").preamble).toBeNull();
    expect(get("ch2-p1").preamble).toBeNull();
  });

  test("keeps a data table readable, one row per line", () => {
    const rows = get("ch2-p3").preamble!.split("\n");
    expect(rows).toContain("Sail boat (S)  |  20%  |  30%");
    expect(rows).toContain("Motor boat (M)  |  12  |  15");
    expect(rows[rows.length - 1]).toBe("The correlation between them is .10.");
  });

  test("shared data for CFA problems applies to CFA problems, not the numbered ones", () => {
    expect(get("ch2-cfa1").preamble).toBe("The following data apply to CFA Problems 1 through 2: An analyst studies a port.");
    expect(get("ch2-cfa2").preamble).not.toBeNull();
    expect(get("ch2-cfa3").preamble).toBeNull();
    expect(get("ch2-p6").text).not.toMatch(/CFA Problems/);
  });

  test("carries on when a problem number is missing from the text", () => {
    const gappy = "PROBLEM SETS    1. First question here.\n 2. Second question here.\n 4. Fourth question, the third was lost.\n 5. Fifth question here.\nUse these inputs for Problems 6 through 7: Shared facts.\n 6. Sixth.\n 7. Seventh.\n E-INVESTMENTS EXERCISES\n";
    const found = parseProblemSets(gappy);
    expect(found.map((p) => p.number)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(found.find((p) => p.number === 2)!.text).toBe("Second question here.");
    expect(found.find((p) => p.number === 5)!.text).toBe("Fifth question here.");
    expect(found.find((p) => p.number === 6)!.preamble).toBe("Use these inputs for Problems 6 through 7: Shared facts.");
  });

  test("a stray number inside a problem does not derail the numbering", () => {
    const nested = "PROBLEM SETS    1. Rank these:\n    3. Not a problem, a stray number.\n 2. Second question.\n 3. Third question.\n E-INVESTMENTS EXERCISES\n";
    expect(parseProblemSets(nested).map((p) => [p.number, p.text.slice(0, 14)])).toEqual([[1, "Rank these: 3."], [2, "Second questio"], [3, "Third question"]]);
  });

  test("control characters left by PDF extraction are removed", () => {
    expect(parseProblemSets("PROBLEM SETS    1. a. \u0007 A bond\u200b pays.\n 2. Next one here.\n E-INVESTMENTS EXERCISES")[0].text).toBe("a. A bond pays.");
  });

  test("text with no problem sets gives nothing", () => {
    expect(parseProblemSets("Just a paragraph of prose.\nNothing numbered.")).toEqual([]);
    expect(parseProblemSets("")).toEqual([]);
  });
});

test("tidyProblemText strips invisible furniture", () => {
  expect(tidyProblemText(["First line", "bod77178_ch07_193-244.indd", "   Visit us at www.mhhe.com/x", "second line"])).toBe("First line second line");
});

import { editionOffsets, isOwnEditionOnly, originalFor, withOriginalQuestions } from "@/lib/problems/originals";
import type { Card } from "@/lib/vault/types";

describe("showing the textbook's full wording", () => {
  const source = { fileName: "Problem Sets.pdf", problems: new Map(parseProblemSets(EXTRACT).map((p) => [textbookKey(p), p])) };
  const problemCard = (heading: string, front: string, note: string | null = null): Card => ({
    id: heading, nodeId: "n.md", front, back: "solution", type: "problem", unitIds: [], tags: [], problem: { heading, formula: null, note },
  });

  test("reads edition differences from the note on a problem", () => {
    expect(editionOffsets("Canadian 4 = US 5")).toEqual({ P: 1 });
    expect(editionOffsets("Canadian CFA 1 = US CFA 2")).toEqual({ CFA: 1 });
    expect(editionOffsets("Canadian 10–16 = US 12")).toEqual({ P: 2 });
    expect(editionOffsets("Canadian SM inputs differ")).toEqual({});
    expect(editionOffsets(null)).toEqual({});
  });

  test("a problem marked as existing only in the course's edition keeps the note's wording", () => {
    expect(isOwnEditionOnly("Canadian 9")).toBe(true);
    expect(isOwnEditionOnly("Canadian CFA 3")).toBe(true);
    expect(isOwnEditionOnly("Canadian 9 = US 12")).toBe(false);
    expect(isOwnEditionOnly("Canadian SM inputs differ")).toBe(false);
    expect(isOwnEditionOnly("lecture")).toBe(false);
    expect(isOwnEditionOnly(null)).toBe(false);
    expect(originalFor(problemCard("Ch2-P1 Own Edition", "A question only in this edition.", "Canadian 1"), source)).toBeNull();
    expect(originalFor(problemCard("Ch2-P1 Reversed", "A question numbered differently.", "US 2 = Canadian 1"), source)).toBeNull();
  });

  test("replaces the note's summary with the full question and its shared data", () => {
    const card = problemCard("Ch2-P5 Graphical Mix", "Draw the line from the dock; read off the best mix.");
    const [shown] = withOriginalQuestions([card], source);
    expect(shown.front).toMatch(/^The following data apply to Problems 3 through 5: A harbour master/);
    expect(shown.front).toMatch(/Draw a line from the dock to the set of options\. What does your graph show for the expected speed of the best mix\?$/);
    expect(shown.problem!.original).toEqual({ source: "Problem Sets.pdf · Chapter 2, Problem 5", noteVersion: card.front, uncertain: false });
    expect(shown.id).toBe(card.id);
    expect(shown.back).toBe("solution");
  });

  test("follows a noted difference in numbering between editions", () => {
    const original = originalFor(problemCard("Ch2-P1 Pier Wood", "Which properties of wood matter for a pier?", "Canadian 1 = US 2"), source)!;
    expect(original.text).toBe("When building a pier, which properties of wood matter? Explain.");
    expect(original.source).toBe("Problem Sets.pdf · Chapter 2, Problem 2");
  });

  test("a write-up covering several problems shows each, with shared data once", () => {
    const original = originalFor(problemCard("Ch2-P3 to P5 Boats", "Work through the boat problems."), source)!;
    expect(original.text.match(/The following data apply/g)).toHaveLength(1);
    expect(original.text).toContain("Problem 3. What is the best mix of the two boats?");
    expect(original.text).toContain("Problem 5. Draw a line from the dock");
    expect(original.source).toBe("Problem Sets.pdf · Chapter 2, Problem 3 to 5");
  });

  test("money in the textbook text is never mistaken for a formula", () => {
    const priced = { fileName: "f.pdf", problems: new Map([["ch1-p1", { chapter: 1, kind: "P" as const, number: 1, text: "Pay $50 now or $60 later?", preamble: null }]]) };
    expect(originalFor(problemCard("Ch1-P1 Pay", "Pay now or later?"), priced)!.text).toBe("Pay \\$50 now or \\$60 later?");
  });

  test("flags a match that shares almost nothing with the note's version", () => {
    const original = originalFor(problemCard("Ch2-P6 Something Else", "Compute the duration of a thirty year coupon bond."), source)!;
    expect(original.uncertain).toBe(true);
  });

  test("leaves a problem alone when the textbook file does not have it, and never touches other cards", () => {
    const missing = problemCard("Ch9-P1 Not In File", "Short version.");
    const lecture = problemCard("L1-2 Lecture Example", "Short version.");
    const plain: Card = { id: "x", nodeId: "n.md", front: "Term", back: "Definition", type: "definition", unitIds: [], tags: [] };
    expect(withOriginalQuestions([missing, lecture, plain], source)).toEqual([missing, lecture, plain]);
    expect(withOriginalQuestions([missing], null)).toEqual([missing]);
  });
});

describe("two regions claiming the same chapter", () => {
  test("the later one never replaces the first", () => {
    const region = (answer: string) => ["CHAPTER 3", "PROBLEM SETS", "1. " + answer, "2. A second question for this chapter?", "SOLUTIONS TO CONCEPT CHECKS"].join("\n");
    const problems = parseProblemSets(region("The first question of chapter three?") + "\n" + region("A different question wrongly labelled chapter three?"));
    expect(problems.filter((p) => p.chapter === 3 && p.number === 1).map((p) => p.text)).toEqual(["The first question of chapter three?"]);
  });
});
