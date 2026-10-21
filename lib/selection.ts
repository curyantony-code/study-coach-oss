// Turns what the student highlighted on a rendered note back into clean text.
// A typeset formula is copied as its LaTeX source ($…$), not as the jumble of glyphs a
// browser would otherwise produce for it.

function latexOf(math: Element): string | null {
  return math.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() ?? null;
}

/** Widens a range so a formula is either fully inside the highlight or not in it at all. */
export function snapToFormulas(range: Range): Range {
  const snapped = range.cloneRange();
  const closestMath = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest(".katex") ?? null;
  const start = closestMath(range.startContainer);
  const end = closestMath(range.endContainer);
  if (start) snapped.setStartBefore(start);
  if (end) snapped.setEndAfter(end);
  return snapped;
}

export function rangeToText(range: Range): string {
  const fragment = snapToFormulas(range).cloneContents();
  for (const math of Array.from(fragment.querySelectorAll(".katex"))) {
    const latex = latexOf(math);
    const display = math.parentElement?.classList.contains("katex-display") ?? false;
    const target = display ? math.parentElement! : math;
    target.replaceWith(latex === null ? "" : display ? `\n$$${latex}$$\n` : `$${latex}$`);
  }
  // Table cells and block elements would otherwise run together.
  for (const block of Array.from(fragment.querySelectorAll("p, li, tr, h1, h2, h3, h4, h5, h6, br, blockquote"))) block.append("\n");
  for (const cell of Array.from(fragment.querySelectorAll("td, th"))) cell.append(" | ");
  return (fragment.textContent ?? "")
    .replace(/ \| \n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
