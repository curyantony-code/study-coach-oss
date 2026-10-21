// Worked problems: a heading whose section has a **Solution.** (or **Solution:**) marker.
//
//   ### Ch7-CFA5 Diversification Statement
//   **Problem.** Which is correct? …
//   **Formula required:** $\sigma_P^2=…$ — [[#Diversification and Portfolio Risk]].
//   **Solution.** **(c).**
//
// The question is everything before the first marker, the answer everything after "Solution".
import type { CardDraft } from "./types";

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;
const PROBLEM_LABEL = /^\*\*Problem\b([^*]*?)[.:]?\*\*[.:]?\s*/i;
const FORMULA_MARKER = /^\*\*Formula required[.:]?\*\*[.:]?\s*/i;
const SOLUTION_MARKER = /^\*\*Solution\b[^*]*?[.:]?\*\*[.:]?\s*/i;
const MIN_FRONT_LENGTH = 5;

interface Line {
  text: string;
  /** Character offset of the line in the note. */
  start: number;
  /** Heading level (1–6), or 0 for ordinary lines and anything inside a code block. */
  level: number;
  inCode: boolean;
}

function scan(body: string): Line[] {
  const lines: Line[] = [];
  let offset = 0;
  let inCode = false;
  for (const text of body.split("\n")) {
    const fence = text.trimStart().startsWith("```");
    const code = inCode || fence;
    if (fence) inCode = !inCode;
    lines.push({ text, start: offset, level: code ? 0 : (text.match(HEADING)?.[1].length ?? 0), inCode: code });
    offset += text.length + 1;
  }
  return lines;
}

function tidy(text: string): string {
  return text.replace(/\n-{3,}\s*$/, "").trim();
}

function join(lines: Line[]): string {
  return lines.map((l) => l.text).join("\n");
}

/** Where one problem sits in the note, for laying it out when the note is displayed. */
export interface ProblemSpan {
  /** Offsets of the whole section in the note body, heading line included. */
  start: number;
  end: number;
  /** The heading line as written, e.g. "### Ch7-CFA5 Diversification Statement". */
  headingLine: string;
  /** The question text, or null when the problem is asked by its heading alone. */
  statement: string | null;
  draft: CardDraft;
}

export interface ProblemExtraction {
  drafts: CardDraft[];
  spans: ProblemSpan[];
  /** The note with its problem sections removed, so other rules do not turn their labels into cards. */
  remainingBody: string;
}

export function extractProblems(body: string): ProblemExtraction {
  const lines = scan(body);
  const drafts: CardDraft[] = [];
  const spans: ProblemSpan[] = [];
  const kept: string[] = [];
  const seenHeadings = new Set<string>();
  let cursor = 0;

  for (let i = 0; i < lines.length; i++) {
    const level = lines[i].level;
    if (level < 2) continue;
    const heading = lines[i].text.match(HEADING)![2];
    // The heading's own text runs to the next heading of any level. It is a problem only if a
    // Solution marker sits there (outside code), so a chapter heading above several problems is not one.
    let ownEnd = i + 1;
    while (ownEnd < lines.length && lines[ownEnd].level === 0) ownEnd++;
    const isMarker = (line: Line, marker: RegExp) => !line.inCode && marker.test(line.text);
    const solutionAt = lines.slice(i + 1, ownEnd).findIndex((l) => isMarker(l, SOLUTION_MARKER));
    if (solutionAt === -1) continue;

    // Once it is a problem, its solution may have sub-headings ("#### Part (b)") of its own.
    let end = ownEnd;
    while (end < lines.length && (lines[end].level === 0 || lines[end].level > level)) end++;
    const content = lines.slice(i + 1, end);
    const formulaAt = content.slice(0, solutionAt).findIndex((l) => isMarker(l, FORMULA_MARKER));
    const rawStatement = tidy(join(content.slice(0, formulaAt === -1 ? solutionAt : formulaAt)));
    const label = rawStatement.match(PROBLEM_LABEL);
    const statement = tidy(rawStatement.replace(PROBLEM_LABEL, ""));
    const solution = tidy(join(content.slice(solutionAt)).replace(SOLUTION_MARKER, ""));
    // A problem written as just a heading and a solution is asked by its heading.
    const front = statement || heading;
    // Leave the section to the other rules unless it really becomes a card.
    if (!solution || front.length < MIN_FRONT_LENGTH || seenHeadings.has(heading)) continue;
    seenHeadings.add(heading);

    const draft: CardDraft = {
      front,
      back: solution,
      type: "problem",
      idKey: `problem:${heading}`,
      problem: {
        heading,
        formula: formulaAt === -1 ? null : tidy(join(content.slice(formulaAt, solutionAt)).replace(FORMULA_MARKER, "")) || null,
        note: label?.[1]?.replace(/^[\s(]+|[\s)]+$/g, "") || null,
      },
    };
    drafts.push(draft);
    const sectionEnd = end < lines.length ? lines[end].start : body.length;
    spans.push({ start: lines[i].start, end: sectionEnd, headingLine: lines[i].text, statement: statement || null, draft });
    kept.push(body.slice(cursor, lines[i].start));
    cursor = sectionEnd;
    i = end - 1;
  }
  kept.push(body.slice(cursor));
  return { drafts, spans, remainingBody: drafts.length === 0 ? body : kept.join("") };
}
