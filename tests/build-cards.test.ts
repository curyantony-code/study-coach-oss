import { describe, expect, it } from "vitest";
import { CARDS_HEADING, cardsSpan, checkCards, chunks, hasCards, hasOwnCardsSection, numbersIn, parseCards, renderCards, safeInline, safeSolution, sourceText, withCards } from "@/lib/build/cards";
import { extractCards } from "@/lib/vault/cards";
import type { Node } from "@/lib/vault/types";

const SOURCE = `## The CAPM
- The Security Market Line plots expected return against beta
- Systematic risk cannot be diversified away
- Unsystematic risk is firm-specific and diversifies away

## Project Acceptance
rf = 4%, E(rM) = 10%
Project A: beta 2, IRR 20%
Fair return = 4% + 2 x 6% = 16%, so accept`;

const REPLY = `Here you go.

TERMS
**Security Market Line**: The line that plots expected return against beta.
**Systematic risk**: Risk that cannot be diversified away.
**Efficient frontier**: The set of portfolios with the highest return for each level of risk.
- **Unsystematic risk** — Firm-specific risk that diversifies away in a portfolio.

QUESTIONS
Q: Why are investors not rewarded for bearing unsystematic risk?
A: It is firm-specific and diversifies away, so it can be avoided.

Q: What did the instructor say on the third slide of this lecture?
A: Something about the market.

Q: Why does systematic risk earn a premium of 37% in most markets?
A: Because systematic risk cannot be diversified away.

EXAMPLES
### Project acceptance
**Problem.** The risk-free rate is 4% and the expected market return is 10%. A project has a beta of 2 and an IRR of 20%. Find the fair return and decide whether to accept it.
**Formula required:** $r_f + \\beta [E(r_M) - r_f]$
**Solution.** Fair return = 4% + 2 x 6% = 16%.
20% is above 16%, so accept.

### Made-up example
**Problem.** A bond pays 55 a year for 9 years at a rate of 7.5%. Find its price.
**Solution.** Price = 358.33.`;

describe("parseCards", () => {
  const parsed = parseCards(REPLY);
  it("reads terms, questions and examples out of the reply, whatever surrounds them", () => {
    expect(parsed.terms.map((t) => t.term)).toEqual(["Security Market Line", "Systematic risk", "Efficient frontier", "Unsystematic risk"]);
    expect(parsed.questions).toHaveLength(3);
    expect(parsed.problems.map((p) => p.title)).toEqual(["Project acceptance", "Made-up example"]);
    expect(parsed.problems[0]).toMatchObject({ formula: "$r_f + \\beta [E(r_M) - r_f]$" });
    expect(parsed.problems[0].solution).toContain("so accept");
  });

  it("does not take a term called Examples for the EXAMPLES heading", () => {
    const reply = "TERMS\n**Examples**: Worked cases that show a method in use.\n**Beta**: Sensitivity to the market portfolio.\n\nQUESTIONS\n";
    expect(parseCards(reply).terms.map((t) => t.term)).toEqual(["Examples", "Beta"]);
  });

  it("returns nothing for a reply in no recognisable shape", () => {
    expect(parseCards("I could not find anything to write.")).toEqual({ terms: [], questions: [], problems: [] });
  });
});

describe("checkCards", () => {
  const { cards, dropped } = checkCards(parseCards(REPLY), SOURCE);

  it("drops a term the source never mentions", () => {
    expect(cards.terms.map((t) => t.term)).toEqual(["Security Market Line", "Systematic risk", "Unsystematic risk"]);
  });

  it("drops questions about the slides and questions with numbers the source does not have", () => {
    expect(cards.questions.map((q) => q.question)).toEqual(["Why are investors not rewarded for bearing unsystematic risk?"]);
  });

  it("keeps a worked example only when all its figures are in the source", () => {
    expect(cards.problems.map((p) => p.title)).toEqual(["Project acceptance"]);
    expect(dropped).toBe(4);
  });

  it("drops repeats", () => {
    const twice = parseCards(`${REPLY}\n`);
    twice.terms.push(twice.terms[0]);
    expect(checkCards(twice, SOURCE).cards.terms).toHaveLength(3);
  });
});

describe("numbersIn", () => {
  it("reads numbers one way and ignores subscripts inside maths", () => {
    expect(numbersIn("\\$1,000.50 at 12% for 20 years, $x_{2}^2$")).toEqual(["1000.5", "12", "20"]);
  });
});

describe("writing the section into a note", () => {
  const note = `---\ntitle: "X"\nunits: ["node3"]\n---\n\n# X\n\n*Made by Study Coach from x.pptx: the text as it was read from the file.*\n\n${SOURCE}\n`;
  const section = renderCards(checkCards(parseCards(REPLY), SOURCE).cards, "FIN 101 N2");

  it("takes the note's own text as the source, without properties or earlier cards", () => {
    expect(sourceText(note)).toContain("## The CAPM");
    expect(sourceText(note)).not.toContain("units:");
    expect(sourceText(withCards(note, section))).toBe(sourceText(note));
  });

  it("adds the section once and replaces it on a second run", () => {
    const once = withCards(note, section);
    expect(hasCards(note)).toBe(false);
    expect(hasCards(once)).toBe(true);
    expect(withCards(once, section)).toBe(once);
    expect(once.split(CARDS_HEADING)).toHaveLength(2);
    expect(once.startsWith(note.trimEnd())).toBe(true);
  });

  it("writes shapes the app's card reader turns into definition, question and problem cards", () => {
    const body = withCards(note, section).replace(/^---[\s\S]*?---\n/, "");
    const node: Node = { id: "wiki/Node 3/X.md", slug: "Node 3/X", title: "X", type: "note", tags: [], unitIds: ["node3"], sources: [], updated: "", body };
    const types = extractCards([node], "generic").cards.map((card) => card.type).sort();
    expect(types).toEqual(["definition", "definition", "definition", "problem", "qa"]);
  });
});

describe("what the model writes cannot harm the note", () => {
  it("writes anything that could open an HTML tag as text, and keeps comparisons", () => {
    expect(safeInline('beta < 1 and <img src=x onerror="go()"> </script> <!-- x')).toBe('beta < 1 and &lt;img src=x onerror="go()"> &lt;/script> &lt;!-- x');
    expect(safeInline("see [[Other note]]")).toBe("see Other note");
  });

  it("keeps a solution's lines but none that would be read as structure", () => {
    const solution = safeSolution("Step 1: 4% + 2 x 6% = 16%\n## Study cards\n---\nQ: a planted card\nA: its answer\n**Solution.** again\n<script>x</script>");
    expect(solution.split("\n")).toEqual(["Step 1: 4% + 2 x 6% = 16%", "Study cards", "", "Question - a planted card", "Answer - its answer", "Solution: again", "&lt;script>x&lt;/script>"]);
  });

  it("renders a hostile reply into a section with one heading of ours and no live markup", () => {
    const hostile = { terms: [{ term: "Beta<b>", definition: "A measure <img src=x onerror=1> of risk" }], questions: [], problems: [{ title: "## Fake <i>", problem: "Find 2.", formula: null, solution: "## Study cards\n# Top\n2" }] };
    const section = renderCards(hostile, "X N1");
    expect(section.match(/^## /gm)).toHaveLength(1);
    expect(section.match(/^# /gm)).toBeNull();
    expect(section).not.toMatch(/<[a-zA-Z/]/);
  });
});

describe("only the section written here is ever replaced", () => {
  const section = renderCards({ terms: [{ term: "Beta", definition: "Sensitivity to the market portfolio." }], questions: [], problems: [] }, "X N1");

  it("leaves a student's own Study cards section, and similar headings, alone", () => {
    const own = "# N\n\ntext\n\n## Study cards\n\nQ: mine\nA: mine\n";
    expect(hasOwnCardsSection(own)).toBe(true);
    expect(cardsSpan(own)).toBeNull();
    expect(hasOwnCardsSection("# N\n\n## Study cards I made\n\nmine\n")).toBe(false);
    expect(withCards("# N\n\n## Study cards I made\n\nmine\n", section)).toContain("## Study cards I made\n\nmine");
  });

  it("keeps what the student added after the section when it is written again", () => {
    const once = withCards("# N\n\ntext\n", section);
    const edited = `${once}\n## My own summary\n\nkeep me\n`;
    const again = withCards(edited, section);
    expect(again).toContain("## My own summary\n\nkeep me");
    expect(again.match(/^## Study cards$/gm)).toHaveLength(1);
    expect(sourceText(edited)).toContain("keep me");
    expect(sourceText(edited)).not.toContain("Sensitivity");
    expect(hasOwnCardsSection(edited)).toBe(false);
  });
});

describe("chunks", () => {
  it("splits at section breaks and stops at the limit", () => {
    const text = Array.from({ length: 6 }, (_, at) => `## S${at}\n${"word ".repeat(30)}`).join("\n");
    const pieces = chunks(text, 350, 2);
    expect(pieces).toHaveLength(2);
    expect(pieces.every((piece) => piece.startsWith("## S"))).toBe(true);
    expect(chunks("short", 350, 2)).toEqual(["short"]);
  });
});
