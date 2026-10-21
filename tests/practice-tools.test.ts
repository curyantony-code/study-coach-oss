import { describe, expect, test } from "vitest";
import { buildSmartContext, buildWikiSystemPrompt } from "@/lib/claude";
import { mcqsFromCards, sasFromCards } from "@/lib/diagnostic-fallback";
import { quizFromCards, tableQuestion, tableRow, type QuizCard } from "@/lib/quiz";
import type { WikiPage } from "@/lib/wiki";

const card = (id: string, front: string, back: string, type = "definition"): QuizCard => ({ id, front, back, source: "notes/portfolio", tags: [], type });

describe("quizFromCards", () => {
  const cards = [
    card("1", "Sharpe ratio", "Excess return per unit of total risk"),
    card("2", "Beta", "Sensitivity of a stock's return to the market's return"),
    card("3", "Alpha", "Return above what the CAPM predicts"),
    card("4", "What does the CML show?", "The best mixes of the risk-free asset and the market portfolio"),
    card("5", "Ch7-P6 Graphical Tangency", "A long worked solution", "problem"),
  ];

  test("builds four-option questions with exactly one right answer", () => {
    const questions = quizFromCards(cards, 3);
    expect(questions).toHaveLength(3);
    for (const q of questions) {
      expect(q.options).toHaveLength(4);
      expect(q.options.filter((o) => o.correct)).toHaveLength(1);
      expect(new Set(q.options.map((o) => o.text)).size).toBe(4);
      expect(q.sourceSlug).toBe("notes/portfolio");
    }
  });

  test("leaves worked problems out and phrases a bare term as a question", () => {
    const questions = quizFromCards(cards, 10);
    expect(questions).toHaveLength(4);
    expect(questions.some((q) => q.stem.includes("Graphical Tangency"))).toBe(false);
    expect(questions.map((q) => q.stem)).toContain("Which of these best matches “Beta”?");
    expect(questions.map((q) => q.stem)).toContain("What does the CML show?");
  });

  test("asks a table row in a full sentence, with other rows of the same table as wrong options", () => {
    const row = (id: string, symbol: string, meaning: string, source = "notes/symbols") => ({ ...card(id, `Symbol: $${symbol}$`, `Meaning: ${meaning} | Units: n/a`, "table-row"), source });
    const table = [row("a", "Q", "Quantity sold"), row("b", "P", "Price per unit"), row("c", "F", "Fixed costs"), row("d", "V", "Variable cost per unit")];
    const questions = quizFromCards([...cards, ...table], 20);
    const q = questions.find((x) => x.stem.includes("$Q$"))!;
    expect(q.stem).toBe("What does the symbol $Q$ stand for?");
    expect(q.options.map((o) => o.text).sort()).toEqual(["Fixed costs", "Price per unit", "Quantity sold", "Variable cost per unit"]);
    expect(q.explanation).toContain("Units: n/a");
  });

  test("words other table rows by their headers", () => {
    expect(tableQuestion(tableRow(card("1", "Term: **Skimming**", "Definition: Pricing high at launch", "table-row"))!)).toBe("What does “Skimming” mean?");
    expect(tableQuestion(tableRow(card("1", "Brand: Uber", "Challenge: Dynamic pricing | Outcome: Faster", "table-row"))!)).toBe("Brand: Uber. What is its challenge?");
    expect(tableRow(card("1", "Sharpe ratio", "Excess return", "definition"))).toBeNull();
  });

  test("a true-or-false card offers True and False", () => {
    const tf = card("tf", "True or False: ADDIE is a training method", "False. It is a design framework.", "misconception");
    const q = quizFromCards([...cards, tf], 20).find((x) => x.cardId === "tf")!;
    expect(q.stem).toBe("True or False: ADDIE is a training method");
    expect(q.options).toEqual([{ text: "True", correct: false }, { text: "False", correct: true }]);
  });

  test("keeps capitals and ready-made questions in table rows", () => {
    expect(tableQuestion(tableRow(card("1", "Touchpoint: Owned", "AI opportunity: Chatbots", "table-row"))!)).toBe("Touchpoint: Owned. What is its AI opportunity?");
    expect(tableQuestion(tableRow(card("1", "Judge question: Why careers?", "Core answer: Evidence", "table-row"))!)).toBe("Why careers?");
  });

  test("skips cards that ask nothing: a bare place, a repeated highlight, a pasted table", () => {
    const junk = [card("j1", "Topic 5", "tax shield per year"), card("j2", "N1 s.17", "SD looks low"), card("j3", "Strategic planning", "Strategic planning", "highlight"), card("j4", "Map", "| A | B |\n|---|---|")];
    const stems = quizFromCards([...cards, ...junk], 20).map((q) => q.stem).join(" ");
    expect(stems).not.toMatch(/Topic 5|N1 s\.17|Strategic planning|Map/);
  });

  test("returns nothing when there are too few cards to make wrong options", () => {
    expect(quizFromCards(cards.slice(0, 2), 5)).toEqual([]);
    expect(quizFromCards(cards, 0)).toEqual([]);
  });
});

function page(slug: string, title: string, sections: Record<string, string>): WikiPage {
  const rawContent = Object.entries(sections).map(([h, t]) => (h === "__intro__" ? t : `## ${h}\n${t}`)).join("\n\n");
  return { slug, filePath: slug, title, type: "note", tags: [], sources: [], updated: "", rawContent, html: "", sections };
}

describe("buildSmartContext", () => {
  const filler = "General remarks about the course that mention nothing in particular. ".repeat(60);
  const long = page("node-2", "Portfolio Selection", {
    __intro__: filler,
    "Two Risky Assets": `${filler} covariance covariance covariance`,
    "Capital Allocation Line": `${filler} tangency tangency`,
  });

  test("finds the relevant section deep inside a long note", () => {
    const context = buildSmartContext([long], [{ role: "user", content: "explain covariance between assets" }]);
    expect(context.indexOf("## Two Risky Assets")).toBeGreaterThan(-1);
    expect(context).toContain("# Portfolio Selection (node-2)");
  });

  test("keeps a short page whole and stays within a sensible size", () => {
    const short = page("defs", "Definitions", { __intro__: "Beta measures market risk." });
    const many = Array.from({ length: 40 }, (_, i) => page(`n${i}`, `Note ${i}`, { __intro__: filler, Part: filler }));
    const context = buildSmartContext([short, ...many], [{ role: "user", content: "beta" }]);
    expect(context).toContain("Beta measures market risk.");
    expect(context.length).toBeLessThan(40_000);
  });
});

describe("buildWikiSystemPrompt", () => {
  test("is written for the course being studied, not for one fixed course", () => {
    const prompt = buildWikiSystemPrompt(3, "FIN 101 Finance Basics", ["Risk and Return", "Portfolio Selection"]);
    expect(prompt).toContain("FIN 101 Finance Basics");
    expect(prompt).toContain("Risk and Return → Portfolio Selection");
    expect(prompt).not.toMatch(/\bHR\b|Week 11|workplace/);
  });

  test("works without unit names", () => {
    expect(buildWikiSystemPrompt()).toContain("the order the material appears in the wiki");
  });
});

describe("Test Me fallback from study cards", () => {
  const cards = [
    card("1", "Sharpe ratio", "Excess return per unit of total risk, used to compare portfolios."),
    card("2", "Beta", "Sensitivity of a stock's return to the market's return."),
    card("3", "Alpha", "Return above what the CAPM predicts for the risk taken."),
    card("4", "What does the CML show?", "The best mixes of the risk-free asset and the market portfolio."),
    card("5", "Ch7-P6 Graphical Tangency", "A long worked solution that is not an option to pick.", "problem"),
  ];
  const groupOf = (slug: string) => (slug === "notes/portfolio" ? "early" : "late");

  test("multiple-choice questions use lettered options and name the right letter", () => {
    const mcqs = mcqsFromCards(cards, 3, groupOf);
    expect(mcqs).toHaveLength(3);
    for (const q of mcqs) {
      expect(q.options.map((o) => o.slice(0, 3))).toEqual(["A. ", "B. ", "C. ", "D. "]);
      const right = q.options.find((o) => o.startsWith(`${q.correct}. `))!;
      expect(q.explanation).toContain(right.slice(3));
      expect(q.explanation).toContain("[[notes/portfolio]]");
      expect(q.group).toBe("early");
    }
  });

  test("short answers ask for an explanation and keep the note's answer for grading", () => {
    const sas = sasFromCards(cards, 2, groupOf, () => 0.5);
    expect(sas).toHaveLength(2);
    expect(sas[0].stem).toMatch(/^In your own words, explain/);
    expect(sas.every((s) => s.concept.length >= 30 && !s.stem.includes("Graphical Tangency"))).toBe(true);
  });
});
