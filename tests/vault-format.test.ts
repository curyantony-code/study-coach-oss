import { describe, expect, test } from "vitest";
import { questionIssues } from "@/lib/questions/rules";
import { buildProblemSet, findProblems } from "@/lib/problems/outline";
import { buildIndex } from "@/lib/vault/build";

// A small vault written exactly as docs/vault-format-prompt.md tells an AI to write one.
// If the app stops reading any of these shapes, the prompt is out of date.
const MANIFEST = `
course: { code: FIN 101, name: Introduction to Finance }
content: { include: [wiki/**], exclude: [raw/**] }
units:
  - { id: node1, label: "Node 1 - Risk, Return & Utility", aliases: [ch5] }
  - { id: node2, label: "Node 2 - Portfolio Selection", aliases: [ch7] }
assessments:
  - { id: midterm, label: Midterm, type: midterm, date: 2026-10-22, covers: [node1] }
  - { id: final, label: Final exam, type: final, date: 2026-12-10, covers: all }
cards: { kind: procedural }
`;

const TOPIC = `---
units: [node2]
tags: [fin101]
---
# FIN 101 - Topic 02 - Portfolio Selection

## Key ideas

**Sharpe ratio**: excess return per unit of total risk.

Q: Why does leverage not change the Sharpe ratio?
A: Borrowing scales expected excess return and standard deviation by the same factor.

> [!question] Which risk does the CAPM reward?
> Only systematic risk, because the rest can be diversified away.

| Symbol | Meaning |
|---|---|
| $\\beta$ | Sensitivity of an asset's return to the market's return |

- [ ] A checklist line that must not become a card

## Worked problems

### Ch7-P6 Graphical Tangency
**Problem (Canadian 6 = US 6).** A stock fund has an expected return of 20% and a standard deviation of 30%. The T-bill rate is 8%. What is the Sharpe ratio of the stock fund?

**Formula required:** $\\text{Sharpe}=\\dfrac{E(r_P)-r_f}{\\sigma_P}$

**Solution.** Excess return is 20% − 8% = 12%.
Sharpe = 12% / 30% = 0.40.

### T2 L3 - Cost of a Perpetuity
**Problem.** A perpetuity pays \\$100 at the end of every year and the discount rate is 5%. Find its present value.

**Formula required:** $PV=\\dfrac{C}{r}$

**Solution.** PV = 100 / 0.05 = \\$2,000.
`;

const QUIZ = `---
units: [node1]
---
# FIN 101 - Cumulative Quiz

**Q1.** Define systematic and unsystematic risk. Which one does the CAPM reward?

**Q2.** What is the utility of a T-bill for an investor with risk aversion $A$?

## Answer key

**Q1.** Systematic risk comes from economy-wide shocks and cannot be diversified away; the CAPM rewards only that.

**Q2.** Its return, because its variance is zero.
`;

const files: Record<string, string> = {
  "wiki/Node 2 - Portfolio Selection/FIN 101 - Topic 02 - Portfolio Selection.md": TOPIC,
  "wiki/_Hubs/FIN 101 - Cumulative Quiz.md": QUIZ,
};
const index = buildIndex({ vaultName: "FIN 101", paths: Object.keys(files), read: (p) => files[p], manifestText: MANIFEST });

describe("a vault written to docs/vault-format-prompt.md", () => {
  test("study.yml gives the course, units in order and dated tests", () => {
    expect(index.hasManifest).toBe(true);
    expect(index.course.code).toBe("FIN 101");
    expect(index.units.map((u) => u.id)).toEqual(["node1", "node2"]);
    expect(index.assessments.map((a) => [a.id, a.date, a.type])).toEqual([["midterm", "2026-10-22", "midterm"], ["final", "2026-12-10", "final"]]);
  });

  test("frontmatter `units: [id]` puts a note in its unit", () => {
    expect(index.nodes.find((n) => n.title.includes("Topic 02"))!.unitIds).toEqual(["node2"]);
    expect(index.nodes.find((n) => n.title.includes("Cumulative Quiz"))!.unitIds).toEqual(["node1"]);
  });

  test("each card form in the prompt becomes a card", () => {
    const fronts = index.cards.map((c) => `${c.type}: ${c.front}`);
    expect(fronts).toContain("definition: Sharpe ratio");
    expect(fronts).toContain("qa: Why does leverage not change the Sharpe ratio?");
    expect(fronts).toContain("callout: Which risk does the CAPM reward?");
    expect(fronts).toContain("table-row: Symbol: $\\beta$");
    expect(fronts).toContain("qa: Define systematic and unsystematic risk. Which one does the CAPM reward?");
    expect(index.cards.some((c) => c.front.includes("checklist line"))).toBe(false);
    expect(index.cards.find((c) => c.front.startsWith("What is the utility"))!.back).toBe("Its return, because its variance is zero.");
  });

  test("worked problems are read with their label note, formula and solution", () => {
    const problems = index.cards.filter((c) => c.type === "problem");
    expect(problems.map((c) => c.problem!.heading)).toEqual(["Ch7-P6 Graphical Tangency", "T2 L3 - Cost of a Perpetuity"]);
    expect(problems[0].problem!.note).toBe("Canadian 6 = US 6");
    expect(problems[0].problem!.formula).toContain("Sharpe");
    expect(problems[0].back).toContain("0.40");
    expect(problems[0].front.startsWith("A stock fund has")).toBe(true);
  });

  test("a problem written one level deeper than the one above it is lost: the prompt forbids it", () => {
    const nested = TOPIC.replace("### T2 L3 - Cost of a Perpetuity", "#### T2 L3 - Cost of a Perpetuity");
    const bad = buildIndex({ vaultName: "v", paths: ["wiki/A/n.md"], read: () => nested, manifestText: null });
    expect(bad.cards.filter((c) => c.type === "problem").map((c) => c.problem!.heading)).toEqual(["Ch7-P6 Graphical Tangency"]);
  });

  test("problems are grouped by chapter and by topic", () => {
    const set = buildProblemSet(findProblems(index.cards, index.nodes), null);
    expect(set.sections.map((s) => s.title)).toEqual(["Chapter 7", "Topic 2: lecture examples"]);
  });

  test("its questions pass the project's question rule", () => {
    for (const card of index.cards.filter((c) => c.type === "problem")) {
      expect(questionIssues(card.front, card.back, card.problem!.heading), card.front).toEqual([]);
    }
  });

  test("nothing warns", () => {
    expect(index.warnings).toEqual([]);
  });
});
