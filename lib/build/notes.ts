// Turns the text pulled out of slides or a document into a note Study Coach can read:
// one "## " section per slide or page, lists as lists, money written so it is not drawn as maths.
const MAX_HEADING = 80;
const MAX_SECTION = 2800;
/** A line on this share of the pages is a header or footer, not content. */
const FURNITURE_SHARE = 0.6;
const MIN_PAGES_FOR_FURNITURE = 5;
const BULLET = /^\s*(?:[•●▪■◦○‣➢➤✓–—*-]|o(?=\s))\s+/;

function squash(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

/** Money and stray symbols that Markdown or the maths drawer would misread. */
export function safeText(line: string): string {
  return line.replace(/\\?\$(?=\d)/g, "\\$").replace(/ \? /g, "? ").replace(/^#+\s*/, "").replace(/^(-{3,}|={3,})$/, "");
}

/**
 * A line with its numbers blanked, so "Page 3 of 40" and "Page 4 of 40" count as one footer.
 * Short labels such as "Example 2" keep their number: they are content, not a footer.
 */
export function withoutNumbers(line: string): string {
  const words = line.split(" ").filter((word) => /[a-z]/i.test(word)).length;
  return words >= 2 || /^(?:page|slide|pg?\.?)\s*\d+/i.test(line) || line.includes("©") ? line.replace(/\d+/g, "#") : line;
}

/** Lines printed on most pages (course name, copyright, page numbers). */
export function furniture(pages: string[][]): Set<string> {
  if (pages.length < MIN_PAGES_FOR_FURNITURE) return new Set();
  const seen = new Map<string, number>();
  for (const lines of pages) for (const line of new Set(lines.map(withoutNumbers))) seen.set(line, (seen.get(line) ?? 0) + 1);
  return new Set([...seen].filter(([, count]) => count / pages.length >= FURNITURE_SHARE).map(([line]) => line));
}

function isHeading(line: string): boolean {
  return line.length >= 3 && line.length <= MAX_HEADING && /[a-z]{3}/i.test(line) && !BULLET.test(line) && !/[.;,]$/.test(line);
}

interface Section {
  heading: string;
  lines: string[];
}

function toSection(lines: string[], number: number, word: string): Section {
  const headingAt = lines.findIndex((line, at) => at < 3 && isHeading(line));
  const heading = headingAt === -1 ? `${word} ${number}` : lines[headingAt];
  const body = lines.filter((_, at) => at !== headingAt).map((line) => (BULLET.test(line) ? `- ${safeText(line.replace(BULLET, ""))}` : safeText(line))).filter(Boolean);
  return { heading: safeText(heading), lines: body };
}

/** Consecutive slides with the same title are one section, as they are one idea. */
function mergeRepeats(sections: Section[]): Section[] {
  const merged: Section[] = [];
  for (const section of sections) {
    const last = merged[merged.length - 1];
    const same = last && last.heading.toLowerCase().replace(/\W*(cont(?:inued|'d|\.)?)\W*$/i, "") === section.heading.toLowerCase().replace(/\W*(cont(?:inued|'d|\.)?)\W*$/i, "");
    if (same && last.lines.join("\n").length + section.lines.join("\n").length < MAX_SECTION) merged[merged.length - 1] = { heading: last.heading, lines: [...last.lines, ...section.lines] };
    else merged.push(section);
  }
  return merged;
}

/** A section title must be unique in its note, so links and the tutor can point at it. */
function uniqueHeadings(sections: Section[]): Section[] {
  const used = new Map<string, number>();
  return sections.map((section) => {
    const count = (used.get(section.heading.toLowerCase()) ?? 0) + 1;
    used.set(section.heading.toLowerCase(), count);
    return count === 1 ? section : { ...section, heading: `${section.heading} (${count})` };
  });
}

/**
 * The body of a note made from pages of text. `word` names the pages ("Slide", "Page") for
 * the ones without a title of their own.
 */
export function pagesToMarkdown(pages: string[], word: string): string {
  const cleaned = pages.map((page) => page.split("\n").map(squash).filter((line) => line && !/^\d{1,4}$/.test(line)));
  const repeated = furniture(cleaned);
  const sections = cleaned
    .map((lines) => lines.filter((line) => !repeated.has(withoutNumbers(line))))
    .map((lines, at) => ({ lines, number: at + 1 }))
    .filter(({ lines }) => lines.length > 0)
    .map(({ lines, number }) => toSection(lines, number, word))
    // A slide that is only a title ("Part 2") has nothing to study.
    .filter((section) => section.lines.length > 0);
  return uniqueHeadings(mergeRepeats(sections))
    .map((section) => `## ${section.heading}\n\n${section.lines.join("\n")}`.trimEnd())
    .join("\n\n");
}

/** A document without pages (Word, plain text): short stand-alone lines become headings. */
export function documentToMarkdown(text: string): string {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.split("\n").map(squash).filter(Boolean)).filter((p) => p.length > 0);
  return paragraphs
    .map((lines, at) => {
      const next = paragraphs[at + 1];
      const alone = lines.length === 1 && isHeading(lines[0]) && lines[0].length <= 60 && next !== undefined && !/[:?]$/.test(lines[0]);
      if (alone) return `## ${safeText(lines[0])}`;
      return lines.map((line) => (BULLET.test(line) ? `- ${safeText(line.replace(BULLET, ""))}` : safeText(line))).join("\n");
    })
    .join("\n\n");
}

/** Splits a Markdown note the student wrote into its properties block and the rest, untouched. */
export function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return match ? { frontmatter: match[1], body: markdown.slice(match[0].length) } : { frontmatter: "", body: markdown };
}
