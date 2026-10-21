import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { classify, figureLabels, isNumeric, splitColumns, toParagraphs, toTable, type Box } from "@/lib/ingest/boxes";

/** Reader output saved from two real spreadsheet screenshots: "x y w h text" per line. */
function fixture(name: string): Box[] {
  return fs.readFileSync(path.join(__dirname, "fixtures", "ingest", name), "utf-8").split("\n").filter((l) => l.split("\t").length >= 5).map((line) => {
    const [x, y, w, h, ...text] = line.split("\t");
    return { x: Number(x), y: Number(y), w: Number(w), h: Number(h), text: text.join("\t") };
  });
}
const box = (x: number, y: number, w: number, text: string, h = 0.03): Box => ({ x, y, w, h, text });

describe("isNumeric", () => {
  it("knows numbers as spreadsheets write them", () => {
    for (const text of ["600,000", "- 40,000", "(1,250)", "12.5%", "$1,500", "-", "0.08"]) expect(isNumeric(text)).toBe(true);
    for (const text of ["Revenue", "OCF(1-Tc)", "Q3", ""]) expect(isNumeric(text)).toBe(false);
  });
});

describe("toTable on real spreadsheet screenshots", () => {
  it("rebuilds every row with its numbers in the right columns", () => {
    const table = toTable(fixture("spreadsheet-tax-shield.tsv"))!;
    expect(table.header.slice(1).filter(Boolean)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8"].filter((n) => table.header.includes(n)));
    const row = (label: RegExp) => table.rows.find((r) => label.test(r[0]))!;
    expect(row(/^Revenue/).slice(2)).toEqual(["600,000", "918,000", "1,248,480", "1,379,570", "1,298,919", "1,104,081", "900,930", "689,211"]);
    expect(row(/^TCF/).slice(1)).toEqual(["- 840,000", "49,600", "110,220", "161,484", "200,192", "201,344", "171,582", "129,353", "344,470"]);
    expect(row(/^NPV/)[1]).toBe("2,355");
    // The investment row has a number only in the first and the last year.
    const investment = row(/^Investment/).slice(1);
    expect([investment[0], investment.at(-1)]).toEqual(["- 800,000", "150,000"]);
    expect(investment.slice(1, -1).every((c) => c === "")).toBe(true);
  });

  it("keeps a label wrapped over several lines as one row", () => {
    const simple = toTable(fixture("spreadsheet-simple.tsv"))!;
    const cost = simple.rows.find((r) => /^Cost/.test(r[0]))!;
    expect(cost[0]).toMatch(/Cost.*fixed.*varia/);
    expect(cost.slice(2)).toEqual(["434,000", "654,800", "896,720", "1,013,144", "983,509", "866,820", "736,129", "590,327"]);
    expect(simple.rows.find((r) => /Depreciation/.test(r[0]))![0]).toMatch(/Depreciation Expense/);
    expect(simple.rows.some((r) => r[0] === "Cost" || r[0] === "ble)")).toBe(false);
  });

  it("repairs a comma misread as a period", () => {
    // The reader sometimes returns "918.000" for "918,000": put that misreading in.
    const boxes = fixture("spreadsheet-simple.tsv").map((b) => (b.text === "918,000" ? { ...b, text: "918.000" } : b));
    expect(boxes.some((b) => b.text === "918.000")).toBe(true);
    const cells = toTable(boxes)!.rows.flat();
    expect(cells).toContain("918,000");
    expect(cells.some((c) => /^\d{1,3}\.\d{3}$/.test(c))).toBe(false);
  });

  it("classifies both as tables", () => {
    expect(classify(fixture("spreadsheet-simple.tsv"))).toBe("table");
    expect(classify(fixture("spreadsheet-tax-shield.tsv"))).toBe("table");
  });
});

describe("classify", () => {
  it("does not mistake a chart's axis numbers for a table", () => {
    const axis = ["0.00", "0.02", "0.04", "0.06", "0.08"].map((t, i) => box(0.1 + i * 0.15, 0.9, 0.05, t));
    const labels = [box(0.2, 0.2, 0.2, "chatbot adoption"), box(0.5, 0.4, 0.2, "employee network"), box(0.3, 0.6, 0.1, "skills")];
    expect(toTable([...axis, ...labels])).toBeNull();
    expect(classify([...axis, ...labels])).toBe("figure");
  });

  it("sees running text and scattered labels for what they are", () => {
    const sentences = Array.from({ length: 6 }, (_, i) => box(0.05, 0.1 + i * 0.12, 0.9, "The firm is considering a new engine and the group recommends going ahead", 0.07));
    expect(classify(sentences)).toBe("text");
    const diagram = [box(0.3, 0.4, 0.1, "Study"), box(0.3, 0.45, 0.1, "finance"), box(0.5, 0.2, 0.04, "“A”"), box(0.5, 0.5, 0.04, "“B”"), box(0.3, 0.8, 0.1, "Do not study")];
    expect(classify(diagram)).toBe("figure");
    expect(classify([])).toBe("figure");
  });
});

describe("text and figures", () => {
  it("joins wrapped lines into paragraphs and starts a new one after a gap", () => {
    const boxes = [box(0.05, 0.10, 0.9, "This phase will last one year and", 0.04), box(0.05, 0.15, 0.6, "cost 100 million.", 0.04), box(0.05, 0.30, 0.7, "Discount rate is 15%.", 0.04)];
    expect(toParagraphs(boxes)).toEqual(["This phase will last one year and cost 100 million.", "Discount rate is 15%."]);
  });

  it("lists a figure's labels in reading order", () => {
    expect(figureLabels([box(0.5, 0.5, 0.1, "Project B"), box(0.1, 0.1, 0.1, "Project A"), box(0.4, 0.1, 0.1, "$10,000")])).toBe("Project A $10,000 · Project B");
  });
});

describe("two-column pages", () => {
  const column = (x: number, words: string) => Array.from({ length: 9 }, (_, i) => box(x, 0.05 + i * 0.05, 0.42, `${words} ${i + 1}`, 0.03));

  it("reads the left column to the bottom before starting the right one", () => {
    const boxes = [...column(0.53, "right"), ...column(0.04, "left")];
    expect(splitColumns(boxes)).toHaveLength(2);
    const text = toParagraphs(boxes).join(" ");
    expect(text.indexOf("left 9")).toBeLessThan(text.indexOf("right 1"));
  });

  it("leaves a single column alone", () => {
    expect(splitColumns(Array.from({ length: 20 }, (_, i) => box(0.05, 0.04 * i, 0.9, "a full-width line of text")))).toHaveLength(1);
  });
});
