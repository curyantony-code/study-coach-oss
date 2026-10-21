import { questionIssues } from "../questions/rules";
import { escapeLatexBackslashes } from "./json";

// Completes a worked example's terse question at the lowest cost that works (see pipeline.ts):
//   ROUTER   a small model lists what the question leaves out and what it asks for (a "brief").
//   COMPOSE  code adds those to the note's own wording. The note's words are never dropped.
//   STAGER   optionally, a larger model turns the result into full sentences; code checks that
//            it changed no numbers before its version is used.
// The AI never free-writes the question, so it cannot invent values or give the answer away:
// every number it contributes is checked against the note by code.

export interface QuestionToComplete {
  heading: string;
  question: string;
  solution: string;
  formula: string | null;
  /** The question just before this one in the note, for questions that say "same data". */
  previous?: string | null;
  /** What the student says is missing or wrong, in their own words. */
  feedback?: string | null;
}

export interface Brief {
  /** Inputs the solver needs that the question does not state. */
  givens: string[];
  /** What the solver must work out, without values. */
  find: string[];
}

export const MAX_FEEDBACK = 600;
const MAX_ITEMS = 10;
const MAX_ITEM_LENGTH = 160;
const MAX_POLISHED_LENGTH = 1800;

export function briefSystemPrompt(courseName: string): string {
  // No worked examples on purpose: a small model copies example phrases into its answers.
  return `You extract the facts of a practice question for a student of ${courseName}. You do NOT solve it and you do NOT rewrite it.

Read the question and its worked solution, then list:
- "givens": input values the solver needs that the QUESTION DOES NOT STATE but the solution starts from. Each is a short phrase naming what the number is, with its unit, using words from the solution. If <previous_question> is present, include the values this question borrows from it. Use an empty list when the question already states everything it needs.
- "find": each quantity the solution works out, named with the solution's own words, WITHOUT its value. One short phrase per quantity or case.

Rules:
- Use only words and numbers that appear in the question, the solution or the previous question. Do not invent anything.
- Never put a computed result, an intermediate value or an answer anywhere.
- If <student_says> is present, the student has told you what is missing: make sure it is covered.
- Keep formulas in LaTeX between dollar signs.

Reply with JSON only, in exactly this shape: {"givens":[],"find":[]}`;
}

export function briefUserPrompt(item: QuestionToComplete): string {
  return `<name>${item.heading}</name>
<question>
${item.question}
</question>
<solution>
${item.solution}
</solution>
${item.previous ? `<previous_question>\n${item.previous}\n</previous_question>\n` : ""}${item.feedback ? `<student_says>\n${item.feedback.slice(0, MAX_FEEDBACK)}\n</student_says>\n` : ""}`;
}

/** Every number in a text as a value: "1,120.00" → 1120, "12%" → 12. */
export function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((token) => Number(token.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
}

function digitCount(value: number): number {
  return String(value).replace(/[^\d]/g, "").length;
}

/**
 * Numbers the solution works out rather than starts from: anything on the right of an "=",
 * and any precise number (four or more digits) that the question itself does not contain.
 */
function computedValues(item: QuestionToComplete): Set<number> {
  const stated = new Set(numbersIn(`${item.question} ${item.previous ?? ""} ${item.feedback ?? ""}`));
  const results = [...item.solution.matchAll(/[=≈]\s*\\?\$?\s*(\d[\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, "")));
  const precise = numbersIn(item.solution).filter((n) => digitCount(n) >= 4);
  return new Set([...results, ...precise].filter((n) => !stated.has(n)));
}

const FILLER = new Set("the a an of for and or to in on at by with from each per is are was be as that this its their after before under over between which what how when if then than into out up down not no all any both either value values amount amounts rate rates given find total new old".split(" "));

function contentWords(text: string): string[] {
  // Money ("\$50") first, or two prices would be read as one long formula and everything between them lost.
  return (text.toLowerCase().replace(/\\\$/g, " ").replace(/\$[^$\n]*\$/g, " ").match(/[a-z][a-z'-]{2,}/g) ?? []).map((w) => w.replace(/(ies|es|s)$/, "")).filter((w) => !FILLER.has(w));
}

/**
 * True when a phrase is about this problem: most of its meaningful words occur in the
 * problem's own text. A small model that drifts ("future value after…" on a dividend
 * problem) fails this and its phrase is dropped.
 */
function grounded(phrase: string, sourceWords: Set<string>, share: number): boolean {
  const words = contentWords(phrase);
  if (words.length === 0) return /\$[^$\n]+\$/.test(phrase) || /\d/.test(phrase);
  return words.filter((w) => sourceWords.has(w)).length / words.length >= share;
}

/** What to find has no number to check, so its words must nearly all come from the problem. */
const FIND_GROUNDING = 0.6;
/** A given is anchored by its number; its label only needs some tie to the problem. */
const GIVEN_GROUNDING = 0.34;

function tidyItem(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .replace(/^[-•*\d.)\s]+/, "")
    .replace(/[.;,\s]+$/, "")
    .slice(0, MAX_ITEM_LENGTH);
}

/**
 * Reads the small model's brief and keeps only what code can stand behind. Returns null when
 * the reply is not the expected JSON at all (so the next model is tried); an empty brief is a
 * valid answer meaning "nothing to add".
 *
 * A given is kept only if it carries a number that (a) the question does not already state,
 * (b) really appears in the solution, the previous question or the student's note, and
 * (c) is not something the solution computes. A "find" item is kept only if it holds no
 * computed value. Invented or leaked numbers cannot get through.
 */
export function readBrief(item: QuestionToComplete, reply: string): Brief | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown = null;
  for (const candidate of [escapeLatexBackslashes(reply.slice(start, end + 1)), reply.slice(start, end + 1)]) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      // Try the next reading.
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Record<string, unknown>;
  if (!Array.isArray(row.givens) && !Array.isArray(row.find)) return null;

  const inQuestion = new Set(numbersIn(item.question));
  const known = new Set(numbersIn(`${item.question} ${item.solution} ${item.previous ?? ""} ${item.feedback ?? ""}`));
  const computed = computedValues(item);
  const sourceWords = new Set(contentWords(`${item.heading} ${item.question} ${item.solution} ${item.previous ?? ""} ${item.feedback ?? ""}`));
  // A usable phrase: real words, no stray "?" from a damaged character, about this problem,
  // and no number that is invented or computed.
  const sound = (text: string, share: number) =>
    /[a-zA-Z]{3,}|\$[^$]+\$/.test(text) && !text.includes("?") && grounded(text, sourceWords, share) && numbersIn(text).every((n) => known.has(n) && !computed.has(n));

  const seen = new Set<string>();
  const unique = (list: string[]) => list.filter((text) => text.length >= 3 && !seen.has(text.toLowerCase()) && seen.add(text.toLowerCase())).slice(0, MAX_ITEMS);
  const givens = unique((Array.isArray(row.givens) ? row.givens : []).map(tidyItem)).filter((text) => {
    const numbers = numbersIn(text);
    return numbers.length > 0 && sound(text, GIVEN_GROUNDING) && numbers.some((n) => !inQuestion.has(n));
  });
  const find = unique((Array.isArray(row.find) ? row.find : []).map(tidyItem).map((text) => text.replace(/\s*[=:≈]\s*\\?\$?[\d.,%\s]+$/, ""))).filter((text) => sound(text, FIND_GROUNDING));
  return { givens, find };
}

const LEAD_IN = /^(so|thus|then|hence|therefore|and|where|with|now|here|note|since|because|if|but|or|total|the|a|an)\s+/i;
const MAX_LABEL_WORDS = 5;
const MAX_FOUND = 6;

/**
 * What a worked solution computes, read from the solution itself with no AI: the names on the
 * left of its "X = number" and "X: number" lines ("EAC = 750.98" gives "EAC").
 * Names the question already assigns a value to are givens, not results, and are left out.
 */
export function resultsNamed(item: Pick<QuestionToComplete, "question" | "solution">): string[] {
  const plain = (text: string) => text.replace(/\\\$/g, "").replace(/[${}]/g, "").replace(/\\(text|mathrm|mathbf|dfrac|frac|cdot|times|left|right)\b/g, " ");
  const question = plain(item.question);
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of plain(item.solution).matchAll(/(?:^|[.;:\n(]|,\s)\s*([A-Za-z\\][^=:;\n.()]{0,60}?)\s*(?:=|:|≈)\s*-?\s*\d/g)) {
    let label = match[1].trim();
    while (LEAD_IN.test(label)) label = label.replace(LEAD_IN, "");
    label = label.replace(/\s+(is|are|was|equals?)$/i, "").trim();
    const words = label.split(/\s+/);
    if (label.length < 2 || words.length > MAX_LABEL_WORDS || /^(step|part|case|year|period|note|answer|solution)\b\s*\d*$/i.test(label)) continue;
    // A remark or a method is not a result: "lecture slide shows…", "rule of 72".
    if (/\b(shows?|gives?|using|uses?|see|slide|lecture|check|rule|method|formula|approach|recall|assume|assuming|let)\b/i.test(label)) continue;
    // Digits belong in a label only as a time frame ("FV after 1 year").
    if (/\d/.test(label.replace(/\d+(\.\d+)?\s*-?\s*(years?|months?|periods?|quarters?|days?|weeks?)\b/gi, "").replace(/_\w+/g, ""))) continue;
    // "r = 10%" restated in the solution is a given: the question sets it.
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^A-Za-z_])${escaped}\\s*(=|:)\\s*-?\\\\?\\$?\\s*\\d`).test(question)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // A bare symbol reads better typeset.
    found.push(/^[A-Za-z]{1,3}(_\w+)?$/.test(label) && /_|^[A-Z]{2,3}$/.test(label) && label.includes("_") ? `$${label}$` : label);
    if (found.length >= MAX_FOUND) break;
  }
  return found;
}

/**
 * The brief that code alone can write, with no AI call: what to find comes from the
 * solution's own result lines, falling back to the example's name ("Air Cleaners EAC").
 */
export function codeBrief(item: QuestionToComplete): Brief {
  const named = resultsNamed(item);
  const title = item.heading.includes(" - ") ? item.heading.slice(item.heading.indexOf(" - ") + 3).trim() : item.heading.replace(/^(Ch\d+-\S+|[A-Z]{1,4}\s*\d+)\s*/, "").trim();
  return { givens: [], find: named.length > 0 ? named : title ? [title] : [] };
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.?!:]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Builds the complete question by code: the question it leans on (if any), the note's own
 * wording, anything it left out, then exactly what to find. Returns null when there is nothing
 * to add: the note's wording already stands on its own.
 */
export function composeQuestion(item: Pick<QuestionToComplete, "question" | "previous">, brief: Brief): string | null {
  const question = item.question.trim();
  const issues = questionIssues(question).map((issue) => issue.kind);
  const parts: string[] = [];
  // A question that says "same loan" is given the question it refers to, word for word.
  const leans = issues.includes("leans-on-another") && Boolean(item.previous?.trim());
  if (leans) parts.push(`The previous question was: “${sentence(item.previous!.trim())}” Now:`);
  parts.push(sentence(question));
  if (brief.givens.length > 0) parts.push(`Also given: ${brief.givens.join("; ")}.`);
  // "Find" earns its place when the question asks for nothing, or when something had to be
  // added: then the cases to work out need spelling out too.
  if (brief.find.length > 0 && (issues.includes("nothing-asked") || brief.givens.length > 0)) parts.push(`Find: ${brief.find.join("; ")}.`);
  return parts.length === 1 ? null : parts.join(" ");
}

/** Joins two briefs, code's first, without repeating an item. */
export function mergeBriefs(first: Brief, second: Brief): Brief {
  const merge = (a: string[], b: string[]) => {
    const seen = new Set(a.map((x) => x.toLowerCase()));
    return [...a, ...b.filter((x) => !seen.has(x.toLowerCase()))];
  };
  return { givens: merge(first.givens, second.givens), find: merge(first.find, second.find) };
}

export const POLISH_SYSTEM_PROMPT = `You are an editor. Rewrite the practice question below as clear, complete sentences a student can read once and start solving.

- Keep EVERY number exactly as written, and add no new numbers.
- Keep every given and everything that is to be found. Remove nothing.
- Fold "Also given:" and "Find:" into natural sentences.
- If it says "same ..." or refers to another question, state the values instead (they are listed under "Also given").
- Do not solve it, hint at the method, or name a formula.
- Keep formulas in LaTeX between dollar signs and write money as \\$1,000.

Reply with the rewritten question only.`;

/**
 * Accepts the larger model's polished wording only if code can verify it: the very same set
 * of numbers as the composed text (none added, none lost), a sensible length, and it still
 * asks for something. Otherwise null, and the composed text stays.
 */
export function acceptPolish(composed: string, reply: string): string | null {
  const text = reply
    .trim()
    .replace(/^["“”']+|["“”']+$/g, "")
    .replace(/^(rewritten question|question)\s*:\s*/i, "")
    .trim();
  if (text.length < 20 || text.length > Math.max(MAX_POLISHED_LENGTH, composed.length * 3)) return null;
  const before = [...new Set(numbersIn(composed))].sort((a, b) => a - b);
  const after = [...new Set(numbersIn(text))].sort((a, b) => a - b);
  if (before.length !== after.length || before.some((n, i) => n !== after[i])) return null;
  if (questionIssues(text).some((issue) => issue.kind === "nothing-asked")) return null;
  return text;
}
