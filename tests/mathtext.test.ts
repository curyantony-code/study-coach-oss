import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import MathText from "@/components/MathText";
import { hasMath, normalizeDisplayMath, splitMath, truncateKeepingMath, unescapeDollars } from "@/lib/mathtext";
import { layoutProblems, pageSections, renderNoteHtml, shortTitle } from "@/lib/vault/render";
import type { Node } from "@/lib/vault/types";

const FORMULA = String.raw`\sigma_P^2 = \frac{1}{n}\bar\sigma^2 + \frac{n-1}{n}\overline{\text{Cov}}`;

describe("splitMath", () => {
  test("finds inline and display formulas between text", () => {
    expect(splitMath(`As $n$ grows: $$${FORMULA}$$ done`)).toEqual([
      { kind: "text", value: "As " },
      { kind: "math", value: "n", display: false },
      { kind: "text", value: " grows: " },
      { kind: "math", value: FORMULA, display: true },
      { kind: "text", value: " done" },
    ]);
  });

  test("understands \\( \\) and \\[ \\] too", () => {
    expect(splitMath(String.raw`a \(x^2\) b \[y\]`)).toEqual([
      { kind: "text", value: "a " },
      { kind: "math", value: "x^2", display: false },
      { kind: "text", value: " b " },
      { kind: "math", value: "y", display: true },
    ]);
  });

  test.each([
    "It costs $5 and $10 today",
    "Pay $100, then $120 next year",
    String.raw`An escaped \$5 and \$10`,
    "Just one $ sign",
    "spaced $ x $ is not math",
  ])("leaves money alone: %s", (text) => {
    expect(splitMath(text)).toEqual([{ kind: "text", value: text }]);
  });

  test("handles formulas next to punctuation, percent signs and several per line", () => {
    const parts = splitMath(String.raw`$y=30/40=0.75$; $E=12+0.75(18)=25.5\%$. ($r_f=8\%$)`);
    expect(parts.filter((p) => p.kind === "math").map((p) => p.value)).toEqual(["y=30/40=0.75", String.raw`E=12+0.75(18)=25.5\%`, String.raw`r_f=8\%`]);
  });

  test("keeps an escaped dollar inside a formula", () => {
    expect(splitMath(String.raw`$P = \$100$`)).toEqual([{ kind: "math", value: String.raw`P = \$100`, display: false }]);
  });

  test("plain text has no math", () => {
    expect(hasMath("Human capital")).toBe(false);
    expect(hasMath("$x$")).toBe(true);
    expect(splitMath("")).toEqual([]);
  });
});

test("unescapeDollars turns \\$ back into $", () => {
  expect(unescapeDollars(String.raw`\$5 off`)).toBe("$5 off");
});

describe("truncateKeepingMath", () => {
  test("leaves short text alone", () => {
    expect(truncateKeepingMath("short $x$", 80)).toBe("short $x$");
  });

  test("cuts plain text at the limit", () => {
    expect(truncateKeepingMath("abcdefghij", 4)).toBe("abcd…");
  });

  test("never cuts a formula in half", () => {
    const text = `Variance $${FORMULA}$ and more words after it`;
    const cut = truncateKeepingMath(text, 20);
    expect(cut).toBe(`Variance $${FORMULA}$…`);
    expect(splitMath(cut).filter((p) => p.kind === "math")).toHaveLength(1);
  });
});

describe("normalizeDisplayMath", () => {
  test("gives a one-line $$…$$ its own fenced block, even right after text", () => {
    expect(normalizeDisplayMath(`falls toward:\n$$${FORMULA}$$\nRisk falls`)).toBe(`falls toward:\n\n$$\n${FORMULA}\n$$\n\nRisk falls`);
  });

  test("leaves inline math, multi-line blocks and code alone", () => {
    const untouched = "text $$a$$ inline\n\n$$\nb\n$$\n\n```\n$$c$$\n```";
    expect(normalizeDisplayMath(untouched)).toBe(untouched);
  });
});

describe("MathText", () => {
  const html = (text: string) => renderToStaticMarkup(createElement(MathText, { text }));

  test("draws the user's formula as typeset math, not backslashes", () => {
    const out = html(`$$${FORMULA}$$`);
    expect(out).toContain('class="katex-display"');
    expect(out).toContain("mfrac");
    expect(out).not.toContain("katex-error");
    // The LaTeX source survives only inside the hidden accessibility annotation.
    expect(out.replace(/<annotation[\s\S]*?<\/annotation>/g, "")).not.toContain("\\frac");
  });

  test("keeps surrounding words, bold, code and wikilink text", () => {
    const out = html("**Sharpe** uses $\\sigma$, see [[Node 3 - CAPM#Results|CAPM results]] and `beta`");
    expect(out).toContain("<strong>Sharpe</strong>");
    expect(out).toContain("CAPM results");
    expect(out).not.toContain("[[");
    expect(out).toContain("<code");
    expect(out).toContain('class="katex"');
  });

  test("shows money as money", () => {
    expect(html(String.raw`Costs \$5 or $10`)).toBe("Costs $5 or $10");
  });

  test("escapes HTML in text and cannot be made to emit links through math", () => {
    expect(html("<img src=x onerror=alert(1)>")).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(html(String.raw`$\href{javascript:alert(1)}{x}$`)).not.toContain("href=");
  });

  test("a formula KaTeX cannot read is marked, and the card still renders", () => {
    expect(html(String.raw`before $\frac{1}{$ after`)).toContain("before");
    expect(html(String.raw`$\notacommand{1}$ ok`)).toContain("ok");
  });
});

describe("Library notes", () => {
  const node = (body: string): Node => ({ id: "a.md", slug: "a", title: "A", type: "note", tags: [], unitIds: [], sources: [], updated: "", body });

  test("render display, inline and in-table math", async () => {
    const out = await renderNoteHtml(
      node(`As $n$ grows:\n$$${FORMULA}$$\nRisk falls.\n\n| Symbol | Meaning |\n|---|---|\n| $\\bar\\sigma^2$, $\\overline{\\text{Cov}}$ | Average variance |\n`),
      []
    );
    expect(out).toContain("katex-display");
    expect(out.match(/class="katex"/g)!.length).toBeGreaterThanOrEqual(4);
    expect(out).toContain("<table>");
    expect(out).not.toContain("$$");
    expect(out).not.toContain("katex-error");
  });

  test("a dollar sign inside a formula does not end it", async () => {
    const out = await renderNoteHtml(node(String.raw`Borrow: $0.6(500{,}000)=\$300{,}000$ at $r_f$.`), []);
    expect(out).not.toContain("katex-error");
    expect(out.match(/class="katex"/g)).toHaveLength(2);
    expect(out).toContain("300");
  });

  test("leave dollar amounts and code alone", async () => {
    const out = await renderNoteHtml(node("Pay $5 now.\n\n```\n$x$ stays code\n```\n"), []);
    expect(out).toContain("Pay $5 now.");
    expect(out).toContain("$x$ stays code");
  });
});

describe("Library note layout", () => {
  const node = (body: string): Node => ({ id: "a.md", slug: "a", title: "A", type: "note", tags: [], unitIds: [], sources: [], updated: "", body });
  const NOTE = String.raw`## Two Risky Assets
Some text.

## Assigned Problems

### Ch7-P4 Weights
**Problem (Canadian 4 = US 5).** Find $w_1$ for two assets.
**Formula required:** $w_1 = \frac{a}{b}$ — see above.
**Solution.** $w_1=0.4$.
*Canadian SM:* 0.5.

### Ch7-P5 Heading Only Problem
**Solution.** 42.

## After & end
Done.
`;

  test("each problem becomes a block with its solution folded away", async () => {
    const html = await renderNoteHtml(node(NOTE), []);
    expect(html.match(/class="problem-card"/g)).toHaveLength(2);
    expect(html.match(/<details class="problem-solution">/g)).toHaveLength(2);
    expect(html).toContain("<summary>Show solution</summary>");
    expect(html).toContain('<p class="problem-note">Canadian 4 = US 5</p>');
    expect(html).toContain('<div class="problem-formula">');
    // The raw labels are replaced by the layout, and the maths is still typeset.
    expect(html).not.toContain("<strong>Solution.</strong>");
    expect(html).not.toContain("<strong>Formula required:</strong>");
    expect(html).not.toContain("katex-error");
    expect(html.indexOf("Find")).toBeLessThan(html.indexOf("problem-formula"));
    expect(html.indexOf("problem-formula")).toBeLessThan(html.indexOf("problem-solution"));
    expect(html).toContain("Canadian SM:");
  });

  test("text around the problems is untouched", () => {
    const laidOut = layoutProblems(NOTE);
    expect(laidOut.startsWith("## Two Risky Assets\nSome text.\n\n## Assigned Problems\n\n### Ch7-P4 Weights")).toBe(true);
    expect(laidOut.endsWith("## After & end\nDone.\n")).toBe(true);
    expect(layoutProblems("# No problems\ntext")).toBe("# No problems\ntext");
  });

  test("sections get anchors for the On this page list", async () => {
    const html = await renderNoteHtml(node(NOTE), []);
    expect(pageSections(html)).toEqual([
      { id: "two-risky-assets", title: "Two Risky Assets" },
      { id: "assigned-problems", title: "Assigned Problems" },
      { id: "after--end", title: "After & end" },
    ]);
  });

  test("titles drop the course code that is already on screen", () => {
    expect(shortTitle("FIN 101 - Node 2 - Portfolio Selection")).toBe("Node 2 - Portfolio Selection");
    expect(shortTitle("FIN 101 — Introduction to Finance — Index")).toBe("Introduction to Finance — Index");
    expect(shortTitle("Week 3 — Workplace Laws")).toBe("Week 3 — Workplace Laws");
    expect(shortTitle("BUS 100")).toBe("BUS 100");
  });

  test("links to a section jump to it, in this note or another", async () => {
    const other: Node = { ...node(""), id: "wiki/Node 3.md", slug: "Node 3", title: "Node 3" };
    const html = await renderNoteHtml(node("## Two Risky Assets\ntext\n\nSee [[#Two Risky Assets]], [[Node 3#Equilibrium Results|the CAPM result]] and [[#Nowhere Section|here]]."), [other]);
    expect(html).toContain('<a href="#two-risky-assets">Two Risky Assets</a>');
    expect(html).toContain('<a href="/browse/Node%203#equilibrium-results">the CAPM result</a>');
    expect(html).toContain('<a href="#nowhere-section">here</a>');
    expect(html).not.toContain("[[");
  });

  test("a stray closing tag in a problem cannot spill the solution out of its fold", async () => {
    const html = await renderNoteHtml(node("### Ch1-P1 Tags\n**Problem.** Close a </div> here.\n**Solution.** done </details> tail\n\n## After\ntext"), []);
    const fold = html.slice(html.indexOf("<details"), html.lastIndexOf("</details>"));
    expect(fold).toContain("tail");
    expect(html.match(/<\/details>/g)).toHaveLength(1);
    expect(html.indexOf("problem-solution")).toBeGreaterThan(html.indexOf("Close a"));
  });

  test("a formula in a section title is listed once", async () => {
    const html = await renderNoteHtml(node("## Variance $\\sigma^2$ & risk\ntext"), []);
    expect(pageSections(html)).toEqual([{ id: expect.any(String), title: "Variance σ2 & risk" }]);
  });
});
