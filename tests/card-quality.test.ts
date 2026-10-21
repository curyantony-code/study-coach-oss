import { describe, expect, it } from "vitest";
import { extractCards } from "@/lib/vault/cards";
import { isAdminTable, isCodeList, isContainerSection, isSectionLabel } from "@/lib/vault/cards/generic-rules";
import type { Node } from "@/lib/vault/types";

const note = (body: string): Node => ({ id: "wiki/_Hubs/Sheet.md", slug: "_Hubs/Sheet", title: "Sheet", type: "note", tags: [], unitIds: [], sources: [], updated: "", body });

describe("cards that ask nothing are not made", () => {
  it("skips a table row whose prompt only names a part of the course", () => {
    const { cards } = extractCards([note("| Sheet label | Formula |\n|---|---|\n| Topic 5 | tax shield = debt times the tax rate |\n| Sharpe ratio | excess return per unit of risk |\n")], "generic");
    expect(cards.map((card) => card.front)).toEqual(["Sheet label: Sharpe ratio"]);
  });

  it("recognises section labels but not real terms that end in a number", () => {
    expect(["Topic 5", "**Week 3**", "ch. 12", "Lecture 4b"].every(isSectionLabel)).toBe(true);
    expect(["Basel 3", "Topic 5 formulas", "Tier 1 capital", "Q4"].some(isSectionLabel)).toBe(false);
  });

  it("does not turn a section that is a log table, or a pile of sub-sections, into one card", () => {
    const log = "| Source | Kept |\n|---|---|\n| slides week 1 | yes |\n| slides week 2 | yes |";
    const nested = `### Topic 01\n${"word ".repeat(40)}\n### Topic 02\n${"word ".repeat(40)}`;
    expect(isContainerSection(log)).toBe(true);
    expect(isContainerSection(nested)).toBe(true);
    expect(isContainerSection("Borrowing scales expected return and risk by the same factor, so the ratio is unchanged.")).toBe(false);
    const { cards } = extractCards([note(`## Source map\n\n${log}\n\n## Leverage\n\nBorrowing scales expected return and risk by the same factor, so the Sharpe ratio is unchanged by it.\n`)], "generic");
    expect(cards.map((card) => card.front)).toEqual(["Sheet — Leverage"]);
  });
});

describe("course admin is not study material", () => {
  it("skips grading tables and yes/no tick tables, keeps real ones", () => {
    expect(isAdminTable(["Assessment", "Covers", "Weight"])).toBe(true);
    expect(isAdminTable(["Formula", "On sheet?"])).toBe(true);
    expect(isAdminTable(["Symbol", "Meaning"])).toBe(false);
    // "Status" can be real content (the status of a technology), so it does not mark a table as admin.
    expect(isAdminTable(["Type", "Human-likeness", "Status", "Example"])).toBe(false);
    expect(isAdminTable(["Term", "Meaning", "Used when?"])).toBe(false);
    const body = "| Assessment | Covers | Weight |\n|---|---|---|\n| Midterm | Topics 1 to 4 | 30% |\n\n| Symbol | Meaning |\n|---|---|\n| beta | Sensitivity of a return to the market |\n";
    expect(extractCards([note(body)], "generic").cards.map((card) => card.front)).toEqual(["Symbol: beta"]);
  });

  it("skips a term whose 'definition' is only a list of problem codes", () => {
    expect(isCodeList("L1-2, Ch6-P5, Ch6-P17–P19, Ch6-CFA1, VG1-1.")).toBe(true);
    expect(isCodeList("Solve P5 using the CAPM")).toBe(false);
    const body = "**Drill**: L1-2, Ch6-P5, Ch6-P17, VG1-1, VG1-2.\n\n**Sharpe ratio**: excess return per unit of total risk.\n";
    expect(extractCards([note(body)], "generic").cards.map((card) => card.front)).toEqual(["Sharpe ratio"]);
  });
});

describe("new cards in a session", () => {
  it("come from topic notes before reference sheets", async () => {
    const { buildQueue } = await import("@/lib/learner/queue");
    const card = (id: string, nodeId: string) => ({ id, nodeId, front: id, back: "b", type: "definition" as const, unitIds: ["u1"], tags: [] });
    const cards = [card("sheet1", "wiki/_Hubs/Formula Sheet.md"), card("topic1", "wiki/Node 1/Risk.md"), card("sheet2", "wiki/_Hubs/Glossary.md"), card("topic2", "wiki/Node 2/CAPM.md")];
    const queue = buildQueue(cards, new Map(), { now: new Date("2026-10-11T12:00:00Z"), limit: 10 });
    expect(queue.map((entry) => entry.card.id)).toEqual(["topic1", "topic2", "sheet1", "sheet2"]);
    // Studying the sheet on its own still works.
    expect(buildQueue(cards.filter((c) => c.id.startsWith("sheet")), new Map(), { now: new Date("2026-10-11T12:00:00Z"), limit: 10 })).toHaveLength(2);
  });
});
