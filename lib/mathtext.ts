// The rule that turns LaTeX written in notes into parts a renderer can draw as real math.
// Follows Obsidian's conventions: $inline$, $$display$$, plus \( \) and \[ \].

export type TextPart =
  | { kind: "text"; value: string }
  | { kind: "math"; value: string; display: boolean };

/**
 * Finds the math in a piece of text. A lone `$` is treated as money, not math, unless it
 * opens right against a formula and closes right against it (`$x^2$`), and the closing `$`
 * is not followed by a digit ("$5 and $10" stays text).
 */
const MATH = new RegExp(
  [
    String.raw`\$\$([\s\S]+?)\$\$`, // 1: $$display$$
    String.raw`\\\[([\s\S]+?)\\\]`, // 2: \[display\]
    String.raw`\\\(([\s\S]+?)\\\)`, // 3: \(inline\)
    String.raw`(?<![\\$\w])\$(?![\s$])((?:\\.|[^$\\\n])+?)(?<![\s\\])\$(?![\d$])`, // 4: $inline$
  ].join("|"),
  "g"
);

export function splitMath(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(MATH)) {
    const start = match.index;
    if (start > cursor) parts.push({ kind: "text", value: text.slice(cursor, start) });
    const display = match[1] ?? match[2];
    parts.push({ kind: "math", value: (display ?? match[3] ?? match[4]).trim(), display: display !== undefined });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) parts.push({ kind: "text", value: text.slice(cursor) });
  return parts;
}

export function hasMath(text: string): boolean {
  return splitMath(text).some((part) => part.kind === "math");
}

/** In running text, `\$` is an escaped dollar sign. */
export function unescapeDollars(text: string): string {
  return text.replace(/\\\$/g, "$");
}

/** Shortens text to about `limit` characters without ever cutting a formula in half. */
export function truncateKeepingMath(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let length = 0;
  let result = "";
  for (const part of splitMath(text)) {
    const raw = part.kind === "math" ? (part.display ? `$$${part.value}$$` : `$${part.value}$`) : part.value;
    if (part.kind === "text" && length + raw.length > limit) {
      return `${result}${raw.slice(0, Math.max(0, limit - length))}…`;
    }
    result += raw;
    length += raw.length;
    if (length >= limit) return `${result}…`;
  }
  return result;
}

/** Rebuilds a formula as markdown source, with `\$` written in a way markdown parsers cannot mistake for the end of the formula. */
function mathSource(part: Extract<TextPart, { kind: "math" }>): string {
  const body = part.value.replace(/\\\$/g, "\\text{\\textdollar}");
  return part.display ? `\n$$\n${body}\n$$\n` : `$${body}$`;
}

function prepareChunk(markdown: string): string {
  // A `$$…$$` on a line of its own becomes a fenced block (see below); everything else keeps its place.
  const fenced = markdown.replace(/^([ \t]*)\$\$(.+?)\$\$[ \t]*$/gm, (_, indent: string, body: string) => `\n${indent}$$\n${indent}${body.trim()}\n${indent}$$\n`);
  return fenced.replace(/(?<![\\$\w])\$(?![\s$])((?:\\.|[^$\\\n])+?)(?<![\s\\])\$(?![\d$])/g, (whole, body: string) =>
    body.includes("\\$") ? mathSource({ kind: "math", value: body, display: false }) : whole
  );
}

/**
 * Prepares a note's markdown for the math renderer, matching what Obsidian shows:
 * - `$$…$$` on a line of its own is a centred display formula even when it directly
 *   follows a line of text. Standard markdown only does that when the `$$` fences sit on
 *   their own lines, so this puts them there.
 * - `\$` inside an inline formula is a dollar sign, not the end of the formula.
 * Code blocks are left alone.
 */
export function normalizeDisplayMath(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```)/)
    .map((chunk) => (chunk.startsWith("```") ? chunk : prepareChunk(chunk)))
    .join("");
}
