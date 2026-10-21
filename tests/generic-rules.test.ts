import { describe, expect, test } from "vitest";
import { genericRules } from "@/lib/vault/cards/generic-rules";
import { parseSections } from "@/lib/vault/notes";
import type { Node } from "@/lib/vault/types";

function run(rule: string, body: string) {
  const node: Node = { id: "n.md", slug: "n", title: "Note", type: "note", tags: [], unitIds: [], sources: [], updated: "", body };
  return genericRules[rule]({ node, sections: parseSections(body) });
}

describe("answer-key rule", () => {
  const quiz = [
    "## A. Definitions",
    "",
    "**Q1.** What is beta?",
    "",
    "**Q2.** Price the bond. Is it a premium",
    "or a discount bond?",
    "",
    "**Q3.** A question with no answer below.",
    "",
    "## Answer key",
    "",
    "**Q1.** Sensitivity to the market.",
    "",
    "**Q2.** $P=908.72$. Discount bond. my calc ? [[Bonds#Bond price]]",
  ].join("\n");

  test("pairs each numbered question with the answer of the same number", () => {
    const cards = run("answer-key", quiz);
    expect(cards.map((c) => [c.front, c.back])).toEqual([
      ["What is beta?", "Sensitivity to the market."],
      ["Price the bond. Is it a premium\nor a discount bond?", "$P=908.72$. Discount bond. my calc ? [[Bonds#Bond price]]"],
    ]);
  });

  test("does nothing without an answer key, and the one-line rule leaves numbered lines alone", () => {
    expect(run("answer-key", "**Q1.** What is beta?\n\n**Q2.** And alpha?")).toEqual([]);
    expect(run("inline", quiz)).toEqual([]);
    expect(run("inline", "Capital of France ? Paris")).toHaveLength(1);
  });
});

describe("tables rule", () => {
  test("skips a log whose first column only says where something is", () => {
    const errata = "| Where | What's wrong | Correct |\n|---|---|---|\n| N1 s.29 | Variance printed as 8.89 | 10.89 |\n";
    expect(run("tables", errata)).toEqual([]);
  });

  test("still makes cards from a glossary table", () => {
    const glossary = "| Symbol | Meaning |\n|---|---|\n| $\\beta$ | Sensitivity to the market |\n";
    expect(run("tables", glossary)).toEqual([{ front: "Symbol: $\\beta$", back: "Meaning: Sensitivity to the market", type: "table-row" }]);
  });
});

describe("headings rule", () => {
  test("skips a section that is mostly tick-boxes", () => {
    const tracker = "## Chapter 5\n\n*Note: numbering differs.*\n\n- [ ] Ch 5 Problem 7 → Scenario mean and SD\n- [x] Ch 5 CFA 1 → Expected return in three markets\n- [ ] Ch 5 CFA 2 → Another one to do\n";
    expect(run("headings", tracker)).toEqual([]);
  });

  test("keeps a section of ordinary prose", () => {
    const prose = "## Separation property\n\nEvery investor holds the same risky portfolio and only the mix with the risk-free asset differs.\n";
    expect(run("headings", prose)).toHaveLength(1);
  });
});
