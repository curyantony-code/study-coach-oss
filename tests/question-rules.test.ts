import { describe, expect, test } from "vitest";
import { briefUserPrompt } from "@/lib/ai/complete-question";
import { draftSystemPrompt } from "@/lib/ai/drafts";
import { readVariants, variantSystemPrompt } from "@/lib/ai/variants";
import { buildWikiSystemPrompt } from "@/lib/claude";
import { questionIssues, SELF_CONTAINED_RULE } from "@/lib/questions/rules";
import { vaultHealth } from "@/lib/vault/health";
import type { Card } from "@/lib/vault/types";

const kinds = (question: string, solution = "", name = "") => questionIssues(question, solution, name).map((i) => i.kind);

describe("the rule: a question must be answerable on its own", () => {
  test("a list of givens that never says what to find is flagged", () => {
    expect(kinds("$r_f=4\\%$, $E(r_M)=10\\%$. A: $\\beta=2$, IRR 20%; B: $\\beta=1.2$, IRR 11%.")).toEqual(["nothing-asked"]);
    expect(kinds("Cadillac: \\$4,000 plus \\$100/yr for 10 years. Cheap: \\$1,000 plus \\$500/yr for 5 years. $r=10\\%$.")).toEqual(["nothing-asked"]);
  });

  test("a question that leans on another one is flagged", () => {
    expect(kinds("Same loan, but repay \\$10,000 principal per year plus interest on the balance. Interest saved?")).toEqual(["leans-on-another"]);
    expect(kinds("Using the data in the previous problem, find the put price.")).toEqual(["leans-on-another"]);
  });

  test("a missing time frame is flagged when the solution is known", () => {
    const q = "Compare FV of \\$1,000 at a 12% APR compounded annually, quarterly, daily and continuously.";
    expect(kinds(q, "FV after 1 year: 1,120.00; after 20 years: 9,646.29.", "T1 L2 - Effect of Compounding Frequency")).toEqual(["missing-detail"]);
  });

  test("sound questions pass, however they ask", () => {
    for (const q of [
      "\\$50,000 invested: 60% chance of \\$80,000, 40% chance of \\$40,000. T-bills pay 6%. Compute $E(r)$ and the risk premium.",
      "$S=70$, $X=75$, $r=12\\%$, $\\sigma=40\\%$, $T=30/365$, no dividends. (a) Call; (b) put.",
      "What is the coefficient of risk aversion $A$?",
      "3-year 10% semiannual bond, YTM 13% → 14%: prices \\$927.38 → \\$904.67. Approximate duration.",
      "Tabulate the portfolio's return for $y=0, 0.25, 0.75$.",
    ]) {
      expect(questionIssues(q), q).toEqual([]);
    }
    // Too short to judge: a bare term on a flashcard is not a broken question.
    expect(questionIssues("Sharpe ratio")).toEqual([]);
  });
});

describe("the rule is enforced project-wide", () => {
  test("every prompt that has an AI write questions carries the rule", () => {
    for (const prompt of [variantSystemPrompt("Any Course"), buildWikiSystemPrompt(3, "Any Course"), draftSystemPrompt("Any Course")]) {
      expect(prompt).toContain(SELF_CONTAINED_RULE);
    }
  });

  test("an AI-written question that breaks the rule is thrown away", () => {
    const examples = [{ cardId: "p1", heading: "T1 L1", question: "Find the PV of a perpetuity paying 10 at 5%.", solution: "PV = 10 / 0.05 = 200, done step by step.", sourceSlug: "n" }];
    const row = (stem: string) => ({ exampleIndex: 0, stem, options: ["150", "96", "0.96", "20"].map((text, i) => ({ text, correct: i === 0 })), explanation: "PV = 12 / 0.08 = 150." });
    expect(readVariants([row("Same perpetuity as before, but the rate is now 8%. Find its present value.")], examples)).toEqual([]);
    expect(readVariants([row("A perpetuity pays \\$12 a year and the discount rate is 8%.")], examples)).toEqual([]);
    expect(readVariants([row("A perpetuity pays \\$12 a year and the discount rate is 8%. What is its present value?")], examples)).toHaveLength(1);
  });

  test("a question that leans on another is completed with the one before it", () => {
    const prompt = briefUserPrompt({ heading: "TVM 13", question: "Same loan, but repay principal yearly.", solution: "…", formula: null, previous: "A \\$50,000 loan at 8% over 5 years." });
    expect(prompt).toContain("<previous_question>\nA \\$50,000 loan at 8% over 5 years.\n</previous_question>");
  });

  test("the health report lists unclear questions for any vault, skipping ones already fixed", () => {
    const card = (id: string, front: string, original = false): Card => ({
      id, nodeId: "n", front, back: "A worked solution.", type: "problem", unitIds: [], tags: [],
      problem: { heading: `Ex ${id}`, formula: null, note: null, ...(original ? { original: { source: "Book", noteVersion: "x", uncertain: false } } : {}) },
    });
    const health = vaultHealth({
      style: "generic", hasManifest: false, course: { name: "C" }, units: [], assessments: [], nodes: [], edges: [], brokenLinks: [], warnings: [],
      cards: [card("1", "Rate 5%, 10 years, payment 100."), card("2", "Find the PV of 100 a year for 10 years at 5%."), card("3", "Rate 5%, 10 years, payment 100.", true)],
    });
    expect(health.unclearQuestions.map((u) => [u.card.id, u.issues[0].kind])).toEqual([["1", "nothing-asked"]]);
  });
});
