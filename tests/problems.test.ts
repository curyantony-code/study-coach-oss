import { describe, expect, test } from "vitest";
import { buildProblemSet, findProblems, itemLabel, latestResults, parseOutline, parseProblemHeading, refKey } from "@/lib/problems/outline";
import { buildIndex } from "@/lib/vault/build";
import { extractProblems } from "@/lib/vault/cards/problem-rule";

const OUTLINE = `Chapter 5: 7; CFA problems 1 to 4

* Chapter 6: 4 to 6, 13 to 19, 27 to 29; CFA problems 1 to 3
* Chapter 7: 4 to 12, 16; CFA problems 5, 9, 10
* Chapter 8: 1 to 10
* Chapter 9: 1 to 3, 8 to 20, 22; CFA problems 3 to 9, 12
* Chapter 10: 5, 6, 8, 9; CFA problems 2 to 4, 6, 8
* Chapter 14: 3, 6, 8, 9, 11, 13, 16, 17, 23; CFA problems 2, 6 (c and d)
* Chapter 15: 7, 12
* Chapter 16: 3, 9, 13 to 14, 20; CFA problem 2 (a, c, d, f)
* Chapter 20: 6, 7, 19, 22
* Chapter 21: 8, 11, 13, 29 to 31`;

describe("parseOutline", () => {
  const chapters = parseOutline(OUTLINE);
  const chapter = (n: number) => chapters.find((c) => c.chapter === n)!.items;

  test("reads every chapter in the outline's order", () => {
    expect(chapters.map((c) => c.chapter)).toEqual([5, 6, 7, 8, 9, 10, 14, 15, 16, 20, 21]);
    expect(chapters.map((c) => c.items.length)).toEqual([5, 16, 13, 10, 25, 9, 11, 2, 6, 4, 6]);
  });

  test("expands ranges and separates textbook problems from CFA problems", () => {
    expect(chapter(5).map(itemLabel)).toEqual(["Problem 7", "CFA 1", "CFA 2", "CFA 3", "CFA 4"]);
    expect(chapter(21).map((i) => i.number)).toEqual([8, 11, 13, 29, 30, 31]);
    expect(chapter(8).every((i) => i.kind === "P")).toBe(true);
  });

  test("keeps sub-parts on the problem they belong to", () => {
    expect(chapter(14).map(itemLabel).slice(-2)).toEqual(["CFA 2", "CFA 6 (c, d)"]);
    expect(chapter(16).map(itemLabel)).toEqual(["Problem 3", "Problem 9", "Problem 13", "Problem 14", "Problem 20", "CFA 2 (a, c, d, f)"]);
  });

  test("ignores other text, tolerates dashes, and merges a repeated chapter", () => {
    const parsed = parseOutline("Assigned problems\nChapter 3 - 1–3\nsee Moodle\n- Chapter 3: 3, 4; CFA problem 1\n");
    expect(parsed).toEqual([
      { chapter: 3, items: [1, 2, 3, 4].map((number) => ({ chapter: 3, kind: "P", number, parts: [] })).concat([{ chapter: 3, kind: "CFA" as never, number: 1, parts: [] }]) },
    ]);
    expect(parseOutline("nothing here")).toEqual([]);
    expect(parseOutline("Chapter 9: P10 to P12")[0].items.map((i) => i.number)).toEqual([10, 11, 12]);
    expect(parseOutline("Chapter 2: read pages 120 to 330")).toEqual([]);
  });
});

describe("parseProblemHeading", () => {
  const refs = (heading: string) => parseProblemHeading(heading)!.refs.map(refKey);

  test.each([
    ["Ch7-CFA5 Diversification Statement", ["ch7-cfa5"], "Diversification Statement"],
    ["Ch5-P7 Scenario Mean and SD of HPR", ["ch5-p7"], "Scenario Mean and SD of HPR"],
    ["Ch9-P10 to P16 Which Situations Are Possible", ["ch9-p10", "ch9-p11", "ch9-p12", "ch9-p13", "ch9-p14", "ch9-p15", "ch9-p16"], "Which Situations Are Possible"],
    ["Ch9-CFA5 to CFA7 Conceptual", ["ch9-cfa5", "ch9-cfa6", "ch9-cfa7"], "Conceptual"],
    ["Ch9-CFA8 and CFA9 Portfolio R vs SML and CML", ["ch9-cfa8", "ch9-cfa9"], "Portfolio R vs SML and CML"],
    ["Ch10-CFA3 CFA4 CFA6 CFA8 Conceptual", ["ch10-cfa3", "ch10-cfa4", "ch10-cfa6", "ch10-cfa8"], "Conceptual"],
    ["Ch14-CFA6c and 6d Discount Bond and Price Path", ["ch14-cfa6"], "Discount Bond and Price Path"],
    ["Ch14-P16 and P17 Current Yield vs YTM", ["ch14-p16", "ch14-p17"], "Current Yield vs YTM"],
    ["Ch16-CFA2 Duration Computations (a, c, d, f)", ["ch16-cfa2"], "Duration Computations (a, c, d, f)"],
  ])("%s", (heading, expected, title) => {
    expect(refs(heading)).toEqual(expected);
    expect(parseProblemHeading(heading)!.title).toBe(title);
  });

  test.each([
    ["Ch7-P5 2 Year Bond", ["ch7-p5"], "2 Year Bond"],
    ["Ch7-P5 2008 Crisis", ["ch7-p5"], "2008 Crisis"],
    ["Ch10-CFA 3 Conceptual", ["ch10-cfa3"], "Conceptual"],
    ["Ch10-Problem 5 and 6 Title", ["ch10-p5", "ch10-p6"], "Title"],
    ["Ch7-P12 to P10 Reversed", ["ch7-p12", "ch7-p10"], "Reversed"],
    ["Ch8-P1, P2, 3 List", ["ch8-p1", "ch8-p2", "ch8-p3"], "List"],
  ])("edge case: %s", (heading, expected, title) => {
    expect(refs(heading)).toEqual(expected);
    expect(parseProblemHeading(heading)!.title).toBe(title);
  });

  test("headings without a chapter and problem number are not outline problems", () => {
    expect(parseProblemHeading("L1-2 Lecture Example")).toBeNull();
    expect(parseProblemHeading("Ch7 Overview")).toBeNull();
    expect(parseProblemHeading("Two Risky Assets")).toBeNull();
  });
});

const NOTE = String.raw`# Node 2

## Two Risky Assets
**Minimum variance**: the weight that gives the lowest portfolio variance.

### L2-1 Lecture Example
**Problem.** Two assets, find $w$.
**Solution.** $w=0.5$.

## Assigned Problems

### Ch7-CFA5 Diversification Statement
**Problem.** Which is correct? (a) eliminates systematic risk; (c) falls at a decreasing rate.
**Formula required:** $\sigma_P^2=\frac1n\bar\sigma^2+\frac{n-1}{n}\overline{\text{Cov}}$ — [[#Diversification and Portfolio Risk]].
**Solution.** **(c).**

### Ch9-P10 to P16 Which Situations Are Possible
**Problem (Canadian 10 = US 12).** Are these possible under CAPM?
**Solution.** 10: no. 11: yes.
*Canadian SM:* same.

---

### Ch7-P4 Heading Only
**Solution:** 42.

## Summary
**Sharpe ratio**: excess return per unit of total risk.
`;

describe("worked-problem rule", () => {
  const { drafts, remainingBody } = extractProblems(NOTE);
  const byHeading = (text: string) => drafts.find((d) => d.problem!.heading.startsWith(text))!;

  test("finds every section that has a solution", () => {
    expect(drafts.map((d) => d.problem!.heading)).toEqual([
      "L2-1 Lecture Example", "Ch7-CFA5 Diversification Statement", "Ch9-P10 to P16 Which Situations Are Possible", "Ch7-P4 Heading Only",
    ]);
    expect(drafts.every((d) => d.type === "problem")).toBe(true);
  });

  test("splits question, formula hint and solution", () => {
    const cfa5 = byHeading("Ch7-CFA5");
    expect(cfa5.front).toBe("Which is correct? (a) eliminates systematic risk; (c) falls at a decreasing rate.");
    expect(cfa5.problem!.formula).toMatch(/^\$\\sigma_P\^2=.*Diversification and Portfolio Risk\]\]\.$/);
    expect(cfa5.back).toBe("**(c).**");
  });

  test("keeps the edition note, extra solution lines, and drops a trailing rule", () => {
    const p10 = byHeading("Ch9-P10");
    expect(p10.problem!.note).toBe("Canadian 10 = US 12");
    expect(p10.front).toBe("Are these possible under CAPM?");
    expect(p10.back).toBe("10: no. 11: yes.\n*Canadian SM:* same.");
    expect(p10.problem!.formula).toBeNull();
  });

  test("a problem with no statement is asked by its heading", () => {
    expect(byHeading("Ch7-P4")).toMatchObject({ front: "Ch7-P4 Heading Only", back: "42." });
  });

  test("removes problem sections from what other rules see, and nothing else", () => {
    expect(remainingBody).not.toContain("**Solution");
    expect(remainingBody).not.toContain("Formula required");
    expect(remainingBody).toContain("**Minimum variance**");
    expect(remainingBody).toContain("## Assigned Problems");
    expect(remainingBody).toContain("**Sharpe ratio**");
    expect(extractProblems("# No problems\ntext").remainingBody).toBe("# No problems\ntext");
  });
});

describe("worked-problem rule: edge cases", () => {
  test("a Solution line inside a code block is not the solution", () => {
    const { drafts } = extractProblems("## Loop Question\nWhat prints?\n```\n# comment\n**Solution.** inside code\n```\n**Solution.** It prints 3.\n");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].front).toContain("**Solution.** inside code");
    expect(drafts[0].back).toBe("It prints 3.");
  });

  test("a solution keeps its own sub-headings, and ends at the next problem", () => {
    const { drafts, remainingBody } = extractProblems("### Ch7-P5 Two Parts\n**Problem.** Do both.\n**Solution.** Part (a): 1.\n#### Part (b)\nIt is 2.\n### Ch7-P6 Next One\n**Solution.** 3.\n## After\ntext\n");
    expect(drafts.map((d) => d.back)).toEqual(["Part (a): 1.\n#### Part (b)\nIt is 2.", "3."]);
    expect(remainingBody).toBe("## After\ntext\n");
  });

  test("a section that cannot become a card is left for the other rules", () => {
    const tooShort = "## Q1\n**Solution.** 42.\n";
    expect(extractProblems(tooShort)).toEqual({ drafts: [], spans: [], remainingBody: tooShort });
    const repeated = extractProblems("## Same Heading\n**Solution.** one\n## Same Heading\n**Solution.** two\n");
    expect(repeated.drafts.map((d) => d.back)).toEqual(["one"]);
    expect(repeated.remainingBody).toContain("**Solution.** two");
  });
});

describe("a vault with worked problems", () => {
  const TRACKER = "| Chapter | Assigned | Node |\n|---|---|---|\n| 7 | 4, CFA 5 | [[Node 2\\|Node 2]] |\n\n| Concept | Node |\n|---|---|\n| Sharpe ratio | [[Node 2#Summary]] |\n\n| Scenario | Type |\n|---|---|\n| [[Node 2#L2-1 Lecture Example]] | Lecture |\n\n| Symbol | Meaning | Node |\n|---|---|---|\n| $w$ | Weight | N2 |\n";
  const index = buildIndex({
    vaultName: "FINA",
    paths: ["wiki/Node 2/Node 2.md", "wiki/_Hubs/Tracker.md", "raw/scratch.md"],
    read: (p) => (p.includes("Node 2.md") ? `---\nchapter: "Node 2 - Ch 7"\n---\n${NOTE}` : p.includes("Tracker") ? TRACKER : "- Draft:: ignore me"),
    manifestText: null,
  });
  const cardsOf = (id: string) => index.cards.filter((c) => c.nodeId === id);

  test("studies from wiki/ only, and takes units from the folders inside it", () => {
    expect(index.nodes.map((n) => n.id)).toEqual(["wiki/Node 2/Node 2.md", "wiki/_Hubs/Tracker.md"]);
    expect(index.nodes[0].slug).toBe("Node 2/Node 2");
    expect(index.units.map((u) => u.label)).toEqual(["_Hubs", "Node 2"]);
  });

  test("a descriptive `chapter:` property is not mined for numbers", () => {
    expect(index.units.some((u) => /^ch\d/.test(u.id))).toBe(false);
  });

  test("a `chapter:` property that lists units still works", () => {
    const unitsFor = (value: string) =>
      buildIndex({ vaultName: "v", paths: ["a.md"], read: () => `---\nchapter: ${value}\n---\ntext`, manifestText: null }).units.map((u) => u.id);
    expect(unitsFor("7")).toEqual(["ch7"]);
    expect(unitsFor("[5, 6]")).toEqual(["ch5", "ch6"]);
    expect(unitsFor('"5, 6"')).toEqual(["ch5", "ch6"]);
    expect(unitsFor('"Ch 9"')).toEqual(["ch9"]);
    expect(unitsFor('"Node 2 - Ch 7"')).toEqual([]);
  });

  test("one stray note in wiki/ does not hide a vault that lives elsewhere", () => {
    const flat = buildIndex({ vaultName: "v", paths: ["a.md", "b.md", "Topic/c.md", "wiki/stray.md"], read: () => "text", manifestText: null });
    expect(flat.nodes).toHaveLength(4);
  });

  test("makes problem cards, and no cards from their labels", () => {
    const cards = cardsOf("wiki/Node 2/Node 2.md");
    expect(cards.filter((c) => c.type === "problem")).toHaveLength(4);
    expect(cards.filter((c) => c.type === "definition").map((c) => c.front)).toEqual(["Minimum variance", "Sharpe ratio"]);
    expect(cards.some((c) => /Formula required|Solution|Problem/.test(c.front) && c.type !== "problem")).toBe(false);
  });

  test("skips navigation tables but keeps real ones", () => {
    expect(cardsOf("wiki/_Hubs/Tracker.md").map((c) => [c.front, c.back])).toEqual([["Symbol: $w$", "Meaning: Weight"]]);
  });

  test("a note that is only a checklist of links makes no cards", () => {
    const tracker = "# Tracker\n\n## Chapter 5\n\n- [ ] Ch 5 Problem 7 → [[Node 1#Ch5-P7 Scenario Mean|Ch5-P7 Scenario Mean]]\n- [ ] Ch 5 CFA 1 → [[Node 1#Ch5-CFA1 Three Markets|Ch5-CFA1 Three Markets]]\n\n## Notes\nReal sentences that explain something worth remembering here.\n";
    const nav = buildIndex({ vaultName: "n", paths: ["Tracker.md"], read: () => tracker, manifestText: null });
    expect(nav.cards.map((c) => c.front)).toEqual(["Tracker — Notes"]);
  });

  test("a problem card keeps its id when its wording is edited", () => {
    const edited = buildIndex({
      vaultName: "FINA", paths: ["wiki/Node 2/Node 2.md"], manifestText: null,
      read: () => NOTE.replace("Which is correct?", "Which statement is right?"),
    });
    const id = (i: typeof index) => i.cards.find((c) => c.problem?.heading.startsWith("Ch7-CFA5"))!.id;
    expect(id(edited)).toBe(id(index));
  });

  test("examples with no chapter are grouped by topic, or by the note they are in", () => {
    const example = (id: string, heading: string, nodeTitle: string) => ({
      card: { id, nodeId: nodeTitle, front: "q", back: "a", type: "problem" as const, unitIds: [], tags: [], problem: { heading, formula: null, note: null } },
      nodeTitle,
      parsed: null,
    });
    const set = buildProblemSet(
      [
        example("a", "T2 L10 - Option to Delay", "FIN 201 - Topic 02 - Capital Budgeting"),
        example("b", "T2 L3 - Product Launch Project", "FIN 201 - Topic 02 - Capital Budgeting"),
        example("c", "T1 L1 - Perpetuity", "FIN 201 - Topic 01 - TVM"),
        example("d", "Homemade Leverage", "FIN 201 - Topic 05 - Capital Structure"),
        example("e", "MM with Taxes", "FIN 201 - Topic 05 - Capital Structure"),
        example("f", "Absolute Priority", "FIN 201 - Topic 07 - Financial Distress"),
      ],
      null
    );
    expect(set.sections.map((s) => [s.title, s.entries.map((e) => e.label)])).toEqual([
      ["Topic 1: lecture examples", ["Example 1: Perpetuity"]],
      ["Topic 2: lecture examples", ["Example 3: Product Launch Project", "Example 10: Option to Delay"]],
      ["Capital Structure: worked examples", ["Homemade Leverage", "MM with Taxes"]],
      ["Financial Distress: worked examples", ["Absolute Priority"]],
    ]);
    expect(new Set(set.sections.map((s) => s.id)).size).toBe(4);
  });

  describe("laid out by the course outline", () => {
    const problems = findProblems(index.cards, index.nodes);
    const set = buildProblemSet(problems, parseOutline("Chapter 7: 4, 5; CFA problems 5\nChapter 9: 10 to 12"));

    test("lists every assigned problem, including ones with no write-up", () => {
      expect(set.fromOutline).toBe(true);
      expect(set.sections.map((s) => [s.title, s.entries.map((e) => `${e.label}:${e.problem ? "ok" : "missing"}`)])).toEqual([
        ["Chapter 7", ["Problem 4:ok", "Problem 5:missing", "CFA 5:ok"]],
        ["Chapter 9", ["Problem 10:ok", "Problem 11:ok", "Problem 12:ok"]],
        ["Other worked examples", ["L2-1 Lecture Example:ok"]],
      ]);
    });

    test("notes when several outline problems share one write-up", () => {
      expect(set.sections[1].entries.map((e) => e.sharedWith)).toEqual([2, 2, 2]);
      expect(set.sections[0].entries.map((e) => e.sharedWith)).toEqual([0, 0, 0]);
    });

    test("orders each write-up once for working through", () => {
      expect(set.order.map((p) => p.card.problem!.heading.split(" ")[0])).toEqual(["Ch7-P4", "Ch7-CFA5", "Ch9-P10", "L2-1"]);
    });

    test("write-ups the outline does not mention get their own section", () => {
      const partial = buildProblemSet(problems, parseOutline("Chapter 7: 4"));
      expect(partial.sections.map((s) => s.title)).toEqual(["Chapter 7", "In your notes, not in the outline", "Other worked examples"]);
      expect(partial.sections[1].entries).toHaveLength(2);
    });
  });

  test("without an outline, chapters come from the headings", () => {
    const set = buildProblemSet(findProblems(index.cards, index.nodes), null);
    expect(set.fromOutline).toBe(false);
    expect(set.sections.map((s) => [s.title, s.entries.map((e) => e.label)])).toEqual([
      ["Chapter 7", ["Problem 4", "CFA 5"]],
      ["Chapter 9", ["Problems 10–16"]],
      ["Other worked examples", ["L2-1 Lecture Example"]],
    ]);
  });
});

test("latestResults keeps the most recent attempt per card", () => {
  const results = latestResults([{ cardId: "a", correct: false }, { cardId: "b", correct: true }, { cardId: "a", correct: true }]);
  expect([...results]).toEqual([["a", "got"], ["b", "got"]]);
});
