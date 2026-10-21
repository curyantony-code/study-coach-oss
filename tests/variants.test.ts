import { describe, expect, test } from "vitest";
import { answerMatchesWorking, examplesFrom, pickExamples, readVariants, reusesExampleNumbers, variantSystemPrompt, variantUserPrompt } from "@/lib/ai/variants";
import { quizTopics } from "@/lib/course";
import { coverageFor } from "@/lib/exam-parts";
import type { Card, Node, Unit } from "@/lib/vault/types";

const problem = (id: string, nodeId: string, heading: string): Card => ({
  id, nodeId, front: `Question for ${heading}: find the value given rate 10% and 5 years.`, back: "Solution: apply the formula step by step to reach 161.05.", type: "problem", unitIds: [], tags: [],
  problem: { heading, formula: null, note: null },
});
const fact = (id: string, nodeId: string, unitIds: string[] = []): Card => ({ id, nodeId, front: "Term", back: "Meaning", type: "definition", unitIds, tags: [] });

describe("worked examples as models", () => {
  const cards = [problem("p1", "a", "T1 L1 - Perpetuity"), problem("p2", "a", "T1 L2 - Annuity"), problem("p3", "b", "T2 L1 - NPV"), fact("f1", "a")];

  test("only problems with a real solution are used", () => {
    expect(examplesFrom(cards).map((e) => e.heading)).toEqual(["T1 L1 - Perpetuity", "T1 L2 - Annuity", "T2 L1 - NPV"]);
    expect(examplesFrom([{ ...cards[0], back: "42" }])).toEqual([]);
  });

  test("picks are spread across notes", () => {
    const picked = pickExamples(cards.filter((c) => c.type === "problem"), 2, () => 0.5);
    expect(new Set(picked.map((c) => c.nodeId)).size).toBe(2);
    expect(pickExamples(cards.filter((c) => c.type === "problem"), 10)).toHaveLength(3);
  });

  test("the prompt carries each example and asks for changed numbers", () => {
    const examples = examplesFrom(cards);
    const prompt = variantUserPrompt(examples);
    expect(prompt).toContain('<example index="0" name="T1 L1 - Perpetuity">');
    expect(prompt).toContain("Write ONE variant question for EACH example above (3 in total)");
    expect(variantSystemPrompt("FIN 201")).toMatch(/Change the predictable variables/);
  });
});

describe("readVariants", () => {
  const examples = examplesFrom([problem("p1", "a", "T1 L1 - Perpetuity"), problem("p2", "a", "T1 L2 - Annuity")]).map((e) => ({ ...e, sourceSlug: "Midterm/Topic 01" }));
  const good = (exampleIndex: number, options = ["\\$120", "\\$100", "\\$83.33", "\\$12"]) => ({
    exampleIndex,
    stem: "A perpetuity pays \\$12 a year and the rate is 10%. What is it worth today?",
    options: options.map((text, i) => ({ text, correct: i === 0 })),
    explanation: "PV = C / r = 12 / 0.10 = 120.",
  });

  test("keeps a well-formed variant and ties it to its example", () => {
    const [q] = readVariants([good(0)], examples);
    expect(q.basedOn).toEqual({ cardId: "p1", heading: "T1 L1 - Perpetuity" });
    expect(q.sourceSlug).toBe("Midterm/Topic 01");
    expect(q.options.filter((o) => o.correct)).toHaveLength(1);
  });

  test("drops malformed rows: wrong option count, duplicates, two right answers, unknown or repeated example", () => {
    const twoRight = { ...good(1), options: good(1).options.map((o, i) => ({ ...o, correct: i < 2 })) };
    const rows = [good(0), good(0), good(5), good(1, ["a", "b", "c"]), good(1, ["10", "10 ", "11", "12"]), twoRight, "nonsense", null];
    expect(readVariants(rows, examples)).toHaveLength(1);
  });

  test("accepts numeric option text and a string index, and rejects a copy of the example", () => {
    const numeric = { ...good("1" as unknown as number), options: [120, 100, 83, 12].map((text, i) => ({ text, correct: i === 0 })) };
    expect(readVariants([numeric], examples)[0].options[0].text).toBe("120");
    expect(readVariants([{ ...good(0), stem: examples[0].question }], examples)).toEqual([]);
  });
});

describe("checking an AI-written question by code", () => {
  test("the answer marked correct must be the one the working reaches", () => {
    expect(answerMatchesWorking("\\$120", "PV = 12 / 0.10 = 120.")).toBe(true);
    expect(answerMatchesWorking("\\$100", "PV = 12 / 0.10 = 120.")).toBe(false);
    expect(answerMatchesWorking("12.5%", "r = 0.125")).toBe(true);
    expect(answerMatchesWorking("\\$1,628.89", "FV = 1000 × 1.05^10 = 1628.894")).toBe(true);
    expect(answerMatchesWorking("Accept the project", "NPV is positive.")).toBe(true);
  });

  test("a variant must not hand the example's numbers back", () => {
    expect(reusesExampleNumbers("Pays \\$10 a year at 8%. Worth?", "Pays \\$10 a year at 8%. Value?")).toBe(true);
    expect(reusesExampleNumbers("Pays \\$12 a year at 8%. Worth?", "Pays \\$10 a year at 8%. Value?")).toBe(false);
    expect(reusesExampleNumbers("Why does leverage raise risk?", "Explain leverage.")).toBe(false);
  });
});

describe("what a midterm and a final cover", () => {
  const unit = (id: string, label: string, order: number): Unit => ({ id, label, aliases: [], order });
  const node = (id: string, unitIds: string[]): Node => ({ id, slug: id, title: `FIN 201 - ${id}`, type: "note", tags: [], unitIds, sources: [], updated: "", body: "" });

  test("a folder called Midterm is the midterm; the final is everything but hubs", () => {
    const index = { units: [unit("mid", "Midterm", 1), unit("fin", "Final", 2), unit("hubs", "_Hubs", 0)], nodes: [node("T1", ["mid"]), node("T6", ["fin"]), node("Glossary", ["hubs"])], assessments: [] };
    expect(coverageFor("midterm", index, null)).toEqual({ nodeIds: ["T1"], basis: "your “Midterm” folder" });
    expect(coverageFor("final", index, null).nodeIds).toEqual(["T1", "T6"]);
  });

  test("otherwise the classes before the first test in the schedule", () => {
    const index = { units: [unit("n1", "Node 1 - Risk", 1), unit("n2", "Node 2 - Portfolio Selection", 2), unit("n3", "Node 3 - CAPM", 3)], nodes: [node("A", ["n1"]), node("B", ["n2"]), node("C", ["n3"])], assessments: [] };
    const entries = [
      { date: "2026-09-10", kind: "class" as const, title: "Topic 1: Risk", chapters: [] },
      { date: "2026-09-17", kind: "class" as const, title: "Topic 2: Portfolio Selection", chapters: [] },
      { date: "2026-10-22", kind: "test" as const, title: "Midterm", chapters: [] },
      { date: "2026-10-29", kind: "class" as const, title: "Topic 3: The CAPM", chapters: [] },
    ];
    const coverage = coverageFor("midterm", index, entries);
    expect(coverage.nodeIds).toEqual(["A", "B"]);
    expect(coverage.basis).toContain("2026-10-22");
  });

  test("with nothing else to go on, the first part of the course", () => {
    const index = { units: [1, 2, 3, 4, 5].map((n) => unit(`c${n}`, `Chapter ${n}`, n)), nodes: [1, 2, 3, 4, 5].map((n) => node(`N${n}`, [`c${n}`])), assessments: [] };
    expect(coverageFor("midterm", index, null).nodeIds).toEqual(["N1", "N2"]);
  });
});

describe("quizTopics", () => {
  test("lists each note with cards once, in course order, without hubs or the course code", () => {
    const unit = (id: string, label: string, order: number): Unit => ({ id, label, aliases: [], order });
    const node = (id: string, title: string, unitIds: string[]): Node => ({ id, slug: id, title, type: "note", tags: [], unitIds, sources: [], updated: "", body: "" });
    const topics = quizTopics({
      units: [unit("fin", "Final", 2), unit("mid", "Midterm", 1), unit("hubs", "_Hubs", 0)],
      nodes: [node("t6", "FIN 201 - Topic 06 - Limits to Debt", ["fin"]), node("t2", "FIN 201 - Topic 02 - NPV", ["mid"]), node("t1", "FIN 201 - Topic 01 - TVM", ["mid"]), node("g", "Glossary", ["hubs"]), node("empty", "Empty", ["mid"])],
      cards: [fact("1", "t6"), fact("2", "t2"), problem("3", "t2", "T2 L1 - NPV"), fact("4", "t1"), fact("5", "g")],
    });
    expect(topics).toEqual([
      { slug: "t1", label: "Topic 01 - TVM", unitLabel: "Midterm", cards: 1, examples: 0 },
      { slug: "t2", label: "Topic 02 - NPV", unitLabel: "Midterm", cards: 2, examples: 1 },
      { slug: "t6", label: "Topic 06 - Limits to Debt", unitLabel: "Final", cards: 1, examples: 0 },
    ]);
  });
});
