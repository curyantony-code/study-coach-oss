import { slug as slugHeading } from "github-slugger";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import { buildResolver, parseWikilink, type LinkResolver } from "./links";
import { normalizeDisplayMath } from "../mathtext";
import { extractProblems } from "./cards/problem-rule";
import type { Node } from "./types";

export function libraryHref(slug: string): string {
  return `/browse/${slug.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Turns [[wikilinks]] into links: to another note in the Library, to a section of it
 * ("[[Note#Heading]]"), or to a section of the same note ("[[#Heading]]"). Links to nothing
 * and file embeds become plain text.
 */
export function linkifyWikilinks(markdown: string, resolve: LinkResolver): string {
  return markdown.replace(/(!?)\[\[([^\]\n]+)\]\]/g, (_, embed: string, inner: string) => {
    const { target, alias, heading } = parseWikilink(inner);
    const text = alias ?? (heading && !target ? heading : target || inner);
    if (embed) return `*${text}*`;
    // The same slugs rehype-slug gives the headings when the note is rendered.
    const anchor = heading ? `#${slugHeading(heading)}` : "";
    if (!target) return anchor ? `[${text}](${anchor})` : `*${text}*`;
    const hit = resolve(target);
    return hit ? `[${text}](${libraryHref(hit.slug)}${anchor})` : `*${text}*`;
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A stray closing tag in a note must not end the problem block early and spill the solution out of its fold. */
function keepInsideWrapper(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```)/)
    .map((chunk) => (chunk.startsWith("```") ? chunk : chunk.replace(/<\/(details|div)\b/gi, "&lt;/$1")))
    .join("");
}

/**
 * Lays each worked problem out as its own block: the question, the required formula set
 * apart, and the solution folded away until asked for (so reading the note does not give
 * the answer before the student has tried). Blank lines around each part let the markdown
 * inside the HTML wrappers be rendered normally.
 */
export function layoutProblems(body: string, originals: Map<string, FullQuestion> = new Map()): string {
  const { spans } = extractProblems(body);
  if (spans.length === 0) return body;
  let result = "";
  let cursor = 0;
  for (const span of spans) {
    const { start, end, headingLine } = span;
    const statement = span.statement === null ? null : keepInsideWrapper(span.statement);
    const formula = span.draft.problem!.formula === null ? null : keepInsideWrapper(span.draft.problem!.formula);
    const solution = keepInsideWrapper(span.draft.back);
    const { note, heading } = span.draft.problem!;
    const original = originals.get(heading);
    const parts = [
      headingLine,
      '<div class="problem-card">',
      note ? `<p class="problem-note">${escapeHtml(note)}</p>` : "",
      original
        ? `<p class="problem-label">Problem</p>\n\n${fullQuestionHtml(original)}`
        : statement
          ? `<p class="problem-label">Problem</p>\n\n${statement}`
          : "",
      formula ? `<div class="problem-formula">\n\n<p class="problem-label">Formula required</p>\n\n${formula}\n\n</div>` : "",
      `<details class="problem-solution">\n<summary>Show solution</summary>\n\n${solution}\n\n</details>`,
      "</div>",
    ];
    result += `${body.slice(cursor, start)}${parts.filter(Boolean).join("\n\n")}\n\n`;
    cursor = end;
  }
  return result + body.slice(cursor);
}

/** The textbook's full wording for a problem, keyed by the problem's heading. */
export interface FullQuestion {
  text: string;
  source: string;
}

/** Textbook text is plain, not markdown: each line becomes a paragraph, with nothing interpreted. */
function fullQuestionHtml(question: FullQuestion): string {
  const paragraphs = question.text
    .replace(/\\\$/g, "$")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => `<p>${escapeHtml(line).replace(/\$/g, "&#36;")}</p>`)
    .join("");
  return `<div class="problem-original">${paragraphs}<p class="problem-source">${escapeHtml(question.source)}</p></div>`;
}

export interface PageSection {
  id: string;
  title: string;
}

/** The `##` sections of a rendered note, for an "On this page" list. */
export function pageSections(html: string): PageSection[] {
  return [...html.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)]
    .map((match) => ({
      id: match[1],
      title: match[2]
        // KaTeX writes each formula twice (MathML and HTML); keep one copy.
        .replace(/<math[\s\S]*?<\/math>/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#x26;/g, "&")
        .trim(),
    }))
    .filter((section) => section.title !== "");
}

/** "FIN 101 - Node 2 - Portfolio Selection" → "Node 2 - Portfolio Selection": the course is already on screen. */
export function shortTitle(title: string): string {
  const trimmed = title.replace(/^[A-Z]{2,5}\s?\d{2,4}[A-Z]?\s*[-–—:]\s*/, "").trim();
  return trimmed || title;
}

export async function renderNoteHtml(node: Node, allNodes: Node[], originals: Map<string, FullQuestion> = new Map()): Promise<string> {
  const result = await remark()
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    // Headings get ids so the page can link to its own sections.
    .use(rehypeSlug)
    // LaTeX ($…$ and $$…$$) is typeset as real notation; a formula KaTeX cannot read is shown in red.
    .use(rehypeKatex, { strict: "ignore" })
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .process(linkifyWikilinks(normalizeDisplayMath(layoutProblems(node.body, originals)), buildResolver(allNodes)));
  return result.toString();
}
