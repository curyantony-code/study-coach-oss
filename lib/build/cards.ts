// Turns the text of a built note into study material: key terms, questions, and the worked
// examples the source itself shows. A cloud model writes; code checks every item against the
// source text and drops what it cannot back up. Pure: lib/build/cards-service.ts does the I/O.
import { parseDrafts } from "../ai/drafts";
import { questionIssues, SELF_CONTAINED_RULE } from "../questions/rules";

export const CARDS_HEADING = "## Study cards";
/** Text sent per request. Free models read far more, but long inputs give thin, generic cards. */
export const CHUNK_CHARS = 12_000;
export const MAX_CHUNKS = 3;
const MAX_TERMS = 14;
const MAX_QUESTIONS = 12;
const MAX_PROBLEMS = 4;
const MIN_DEFINITION = 15;
const MAX_DEFINITION = 320;
/** The share of an answer's own words that must come from the source. */
const GROUNDED_SHARE = 0.6;
/** Counts this small ("three reasons") need not be printed in the source. */
const FREE_NUMBER_MAX = 12;

export interface Term {
  term: string;
  definition: string;
}

export interface Question {
  question: string;
  answer: string;
}

export interface Problem {
  title: string;
  problem: string;
  formula: string | null;
  solution: string;
}

export interface StudyCards {
  terms: Term[];
  questions: Question[];
  problems: Problem[];
}

export function cardsSystemPrompt(courseName: string): string {
  return `You turn the text of one lecture from ${courseName} into study material. The text was read from slides, so it is terse and may be out of order. Use ONLY what the text says: never add facts, examples or numbers of your own.

Reply in exactly this layout, with these three headings in capitals. Leave a part empty if the text gives nothing for it.

TERMS
**<term as the text writes it>**: <what it means, one sentence, in plain words>

QUESTIONS
Q: <question>
A: <answer in one to three sentences>

EXAMPLES
### <short title of the example>
**Problem.** <the full question>
**Formula required:** <the formula, in LaTeX between dollar signs>
**Solution.** <the working, one step per line, ending with the answer>

Rules:
- TERMS: up to ${MAX_TERMS}. Only terms the text defines or explains. One line each.
- QUESTIONS: up to ${MAX_QUESTIONS}. Ask why and how, compare two ideas, or apply an idea. Never ask about the slides themselves (their titles, order or layout), the instructor, dates or grading.
- EXAMPLES: only a numerical example whose numbers AND solution are both in the text. Copy its numbers exactly. If the text shows no worked example, write nothing under EXAMPLES.
  Write the Problem as full sentences that name every given and say exactly what to find, not as shorthand ("rf = 4%, beta = 2. Accept?").
- Write money as \\$1,000 and maths in LaTeX between dollar signs.

${SELF_CONTAINED_RULE}`;
}

export function cardsUserPrompt(noteTitle: string, text: string): string {
  return `<lecture title="${noteTitle.replace(/"/g, "'")}">\n${text}\n</lecture>`;
}

/** The line under the heading that marks a section as written here, not by the student. */
export const CARDS_MARK = "*Written by AI from the text above";

/**
 * Where the cards section written here sits in a note: from its heading to the next "## "
 * heading or the end. Null when there is none. A "## Study cards" heading without the mark
 * under it is the student's own and is never treated as ours.
 */
export function cardsSpan(note: string): { start: number; end: number } | null {
  for (const match of note.matchAll(/^## Study cards[ \t]*\r?$/gm)) {
    const start = match.index;
    const after = start + match[0].length;
    if (!note.slice(after, after + 200).replace(/^\s+/, "").startsWith(CARDS_MARK)) continue;
    const next = note.slice(after).search(/^## /m);
    return { start, end: next === -1 ? note.length : after + next };
  }
  return null;
}

/** True when the student has a "Study cards" section of their own: such a note is left alone. */
export function hasOwnCardsSection(note: string): boolean {
  return /^## Study cards[ \t]*\r?$/m.test(note) && cardsSpan(note) === null;
}

/** The note's own text: its body without the properties block and without cards written earlier. */
export function sourceText(note: string): string {
  const span = cardsSpan(note);
  const without = span ? note.slice(0, span.start) + note.slice(span.end) : note;
  return without.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

/** Splits text into pieces at section breaks, each small enough for one request. */
export function chunks(text: string, size: number = CHUNK_CHARS, limit: number = MAX_CHUNKS): string[] {
  const sections = text.split(/\n(?=## )/);
  const out: string[] = [];
  let current = "";
  for (const section of sections) {
    if (current && current.length + section.length + 1 > size) {
      out.push(current);
      current = "";
    }
    current = current ? `${current}\n${section}` : section.slice(0, size);
  }
  if (current.trim()) out.push(current);
  return out.slice(0, limit);
}

/** A part heading on a line of its own, in capitals as asked for: "TERMS", "## TERMS", "**TERMS**:". */
function partHeading(name: string): RegExp {
  return new RegExp(`^[ \\t]*(?:#+[ \\t]*|\\*\\*)?${name}\\**[ \\t]*:?[ \\t]*$`, "m");
}

function part(reply: string, heading: string, next: string[]): string {
  const start = reply.search(partHeading(heading));
  if (start === -1) return "";
  const rest = reply.slice(start).replace(/^.*\n?/, "");
  const end = next.map((name) => rest.search(partHeading(name))).filter((at) => at !== -1);
  return end.length > 0 ? rest.slice(0, Math.min(...end)) : rest;
}

/** Reads the model's reply into its three kinds of item, ignoring anything else it wrote. */
export function parseCards(reply: string): StudyCards {
  const terms = [...part(reply, "TERMS", ["QUESTIONS", "EXAMPLES"]).matchAll(/^\s*(?:[-*]\s+)?\*\*([^*\n]+?):?\*\*\s*[:—–-]?\s*(.+)$/gm)]
    .map((match) => ({ term: match[1].trim(), definition: match[2].trim() }));
  const questions = parseDrafts(part(reply, "QUESTIONS", ["EXAMPLES", "TERMS"])).map(({ question, answer }) => ({ question, answer }));
  const problems = part(reply, "EXAMPLES", ["TERMS", "QUESTIONS"]).split(/^###\s+/m).slice(1).flatMap((block): Problem[] => {
    const title = block.split("\n")[0].trim();
    const problem = block.match(/\*\*Problem\b[^*]*\*\*[.:]?\s*([\s\S]*?)(?=\n\s*\*\*(?:Formula required|Solution)\b|$)/i)?.[1].trim();
    const formula = block.match(/\*\*Formula required[.:]?\*\*[.:]?\s*(.+)/i)?.[1].trim() ?? null;
    const solution = block.match(/\*\*Solution\b[^*]*\*\*[.:]?\s*([\s\S]*)$/i)?.[1].trim();
    return title && problem && solution ? [{ title, problem, formula, solution }] : [];
  });
  return { terms, questions, problems };
}

function plain(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9%.]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Every number in a text, written one way ("1,000.50" and "1000.5" are the same number). */
export function numbersIn(text: string): string[] {
  // Money ("\$50") is set aside first, so its dollar sign is not read as the start of a formula.
  const withoutMoneySigns = text.replace(/\\\$/g, " ");
  return [...withoutMoneySigns.replace(/\$[^$\n]*\$/g, (maths) => maths.replace(/[_^]\{?\d+\}?/g, " ")).matchAll(/\d[\d,]*(?:\.\d+)?/g)]
    .map((match) => match[0].replace(/,/g, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""));
}

function stem(word: string): string {
  return word.replace(/(?:ing|ed|es|s|ly)$/, "");
}

function contentWords(text: string): string[] {
  return plain(text.replace(/\\\$/g, " ").replace(/\$[^$\n]*\$/g, " ")).replace(/[^a-z ]/g, " ").split(" ").filter((word) => word.length >= 5 && /^[a-z]+$/.test(word)).map(stem);
}

export interface Source {
  text: string;
  numbers: Set<string>;
  words: Set<string>;
}

export function readSource(text: string): Source {
  return { text: ` ${plain(text)} `, numbers: new Set(numbersIn(text)), words: new Set(contentWords(text)) };
}

/** True when every number in `text` is printed in the source, small counts aside. */
export function numbersBacked(text: string, source: Source): boolean {
  return numbersIn(text).every((number) => source.numbers.has(number) || (/^\d+$/.test(number) && Number(number) <= FREE_NUMBER_MAX));
}

/** True when most of the text's own words come from the source: it restates, it does not invent. */
export function wordsBacked(text: string, source: Source, share: number = GROUNDED_SHARE): boolean {
  const words = contentWords(text);
  if (words.length === 0) return true;
  return words.filter((word) => source.words.has(word)).length / words.length >= share;
}

const ABOUT_THE_SLIDES = /\b(slides?|lecture|this (?:text|note|deck|chapter)|the (?:text|notes?|deck)|instructor|professor|syllabus|grading|office hours)\b/i;

export interface Checked {
  cards: StudyCards;
  /** How many items the model wrote that the checks removed. */
  dropped: number;
}

/** Keeps only what the source backs up, without repeats, within the limits. */
export function checkCards(cards: StudyCards, sourceTextValue: string): Checked {
  const source = readSource(sourceTextValue);
  const seen = new Set<string>();
  const fresh = (key: string) => {
    const id = plain(key);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  };

  const terms = cards.terms.filter(({ term, definition }) =>
    term.length >= 3 && term.length <= 80 && !/^(q|a|question|answer|problem|solution)$/i.test(term)
    && definition.length >= MIN_DEFINITION && definition.length <= MAX_DEFINITION
    && source.text.includes(` ${plain(term)}`)
    && numbersBacked(definition, source) && wordsBacked(definition, source)
    && fresh(`t:${term}`)).slice(0, MAX_TERMS);

  const questions = cards.questions.filter(({ question, answer }) =>
    question.length >= 12 && answer.length >= 8
    && !ABOUT_THE_SLIDES.test(question)
    && questionIssues(question).length === 0
    && numbersBacked(`${question} ${answer}`, source) && wordsBacked(answer, source)
    && fresh(`q:${question}`)).slice(0, MAX_QUESTIONS);

  const problems = cards.problems.filter(({ title, problem, solution }) =>
    numbersIn(problem).length > 0
    // A worked example is copied, not composed: every figure in it must be in the source.
    && numbersIn(`${problem} ${solution}`).every((number) => source.numbers.has(number) || (/^\d$/.test(number)))
    && questionIssues(problem, solution, title).length === 0
    && fresh(`p:${title}`)).slice(0, MAX_PROBLEMS);

  const total = cards.terms.length + cards.questions.length + cards.problems.length;
  return { cards: { terms, questions, problems }, dropped: total - terms.length - questions.length - problems.length };
}

export function mergeCards(parts: StudyCards[]): StudyCards {
  return { terms: parts.flatMap((p) => p.terms), questions: parts.flatMap((p) => p.questions), problems: parts.flatMap((p) => p.problems) };
}

export function countCards(cards: StudyCards): number {
  return cards.terms.length + cards.questions.length + cards.problems.length;
}

/**
 * Model text made safe to put in a note. Notes are drawn with their HTML live, so a tag in a
 * reply would run when the note is opened: every "<" that could open one is written as text.
 * Wiki links are flattened too, so a reply cannot plant links to other notes.
 */
export function safeInline(text: string): string {
  return text.replace(/<(?=[a-zA-Z/!?])/g, "&lt;").replace(/\[\[|\]\]/g, "");
}

function oneLine(text: string): string {
  return safeInline(text).replace(/\s*\n\s*/g, " ").trim();
}

/**
 * A worked solution keeps its lines, but none of them may be read as structure: no headings,
 * no rules, no "Q:" lines the card reader would take for another card, no bold markers that
 * start a new problem part.
 */
export function safeSolution(text: string): string {
  return safeInline(text).trim().split(/\r?\n/).map((line) => line
    .replace(/^\s*#+\s*/, "")
    .replace(/^\s*(?:-{3,}|={3,}|\*{3,}|_{3,})\s*$/, "")
    .replace(/^\s*(Q|A)(uestion|nswer)?\s*:/i, (_, letter: string) => (letter.toLowerCase() === "q" ? "Question -" : "Answer -"))
    .replace(/^\s*\*\*(Problem|Solution|Formula required)\b[^*]*\*\*[.:]?/i, "$1:")
    .replace(/^\s*>\s*\[!/, "[!")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** A heading that cannot be mistaken for another problem's: unique in the vault through the note's name. */
function problemHeading(noteLabel: string, number: number, title: string): string {
  return `### ${noteLabel} Ex${number} - ${oneLine(title).replace(/^#+\s*/, "").replace(/[[\]|<>]/g, " ").slice(0, 70)}`;
}

/** The section written into the note, in the shapes the card reader recognises. */
export function renderCards(cards: StudyCards, noteLabel: string): string {
  const lines = [CARDS_HEADING, "", `${CARDS_MARK}; each item was checked against that text. Edit or delete freely.*`, ""];
  if (cards.terms.length > 0) lines.push(...cards.terms.map(({ term, definition }) => `**${oneLine(term).replace(/\*/g, "")}**: ${oneLine(definition)}`), "");
  for (const { question, answer } of cards.questions) lines.push(`Q: ${oneLine(question)}`, `A: ${oneLine(answer)}`, "");
  cards.problems.forEach(({ title, problem, formula, solution }, at) => {
    lines.push(problemHeading(noteLabel, at + 1, title), `**Problem.** ${oneLine(problem)}`, "");
    if (formula) lines.push(`**Formula required:** ${oneLine(formula)}`, "");
    lines.push(`**Solution.** ${safeSolution(solution)}`, "");
  });
  return lines.join("\n").trimEnd() + "\n";
}

/**
 * The note with its study cards section added at the end, or replaced where it was. Only the
 * section written here is ever replaced: everything before and after it is kept as it is.
 */
export function withCards(note: string, section: string): string {
  const span = cardsSpan(note);
  if (!span) return `${note.trimEnd()}\n\n${section}`;
  const after = note.slice(span.end);
  return `${note.slice(0, span.start).trimEnd()}\n\n${section}${after ? `\n${after}` : ""}`;
}

export function hasCards(note: string): boolean {
  return cardsSpan(note) !== null;
}
