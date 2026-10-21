// Card rules for ordinary Obsidian vaults. Each rule only fires on an explicit pattern;
// anything looser would be a guess (docs/ARCHITECTURE.md).
import { stripCode } from "../notes";
import type { CardDraft, CardRule } from "./types";

const WIKILINK = /\[\[[^\]\n]*\]\]/g;
const MIN_ANSWER_LENGTH = 3;
const MIN_DEFINITION_LENGTH = 10;
const HEADING_BODY_MIN = 30;
const HEADING_BODY_MAX = 800;
const QUESTION_CALLOUTS = /^>\s*\[!(question|faq|flashcard|quiz|help)\][+-]?\s*(.*)$/i;

function lines(body: string): string[] {
  return stripCode(body).split("\n");
}

/** `> [!question] Front` followed by `> answer` lines. */
const callouts: CardRule = ({ node }) => {
  const drafts: CardDraft[] = [];
  const all = lines(node.body);
  for (let i = 0; i < all.length; i++) {
    const start = all[i].match(QUESTION_CALLOUTS);
    if (!start) continue;
    const answer: string[] = [];
    while (i + 1 < all.length && all[i + 1].startsWith(">")) {
      answer.push(all[++i].replace(/^>\s?/, ""));
    }
    const back = answer.join("\n").trim();
    if (start[2].trim() && back) drafts.push({ front: start[2].trim(), back, type: "callout" });
  }
  return drafts;
};

const QUESTION_LINE = /^(?:[-*]\s+)?\**Q(?:uestion)?\**\s*[:.]\**\s*(.+)$/i;
const ANSWER_LINE = /^(?:[-*]\s+)?\**A(?:nswer)?\**\s*[:.]\**\s*(.*)$/i;

const NEW_BLOCK = /^(#{1,6}\s|[-*]\s|---|>|\|)/;

/** `Q: …` then `A: …`; the answer runs until a blank line, the next question or a new block. */
const qa: CardRule = ({ node }) => {
  const drafts: CardDraft[] = [];
  const all = lines(node.body);
  for (let i = 0; i < all.length; i++) {
    const question = all[i].trim().match(QUESTION_LINE);
    if (!question) continue;
    let j = i + 1;
    while (j < all.length && all[j].trim() === "") j++;
    const answerStart = all[j]?.trim().match(ANSWER_LINE);
    if (!answerStart) continue;
    const answer = [answerStart[1]];
    const endsAnswer = (line: string) => line === "" || QUESTION_LINE.test(line) || NEW_BLOCK.test(line);
    while (j + 1 < all.length && !endsAnswer(all[j + 1].trim())) {
      answer.push(all[++j].trim());
    }
    const back = answer.join("\n").trim();
    if (back.length >= MIN_ANSWER_LENGTH) drafts.push({ front: question[1].trim(), back, type: "qa" });
    i = j;
  }
  return drafts;
};

const NUMBERED_QUESTION = /^\*\*Q(\d+)[.:]?\*\*[.:]?\s*(.+)$/;
const ANSWER_KEY_HEADING = /^#{1,6}\s+(answer key|answers?|solutions?|answer sheet|marking scheme)\b/i;

/** `**Q3.** text` lines by number; a line runs on until the next blank line. */
function numbered(all: string[]): Map<string, string> {
  const found = new Map<string, string>();
  for (let i = 0; i < all.length; i++) {
    const start = all[i].trim().match(NUMBERED_QUESTION);
    if (!start) continue;
    const text = [start[2]];
    while (i + 1 < all.length && all[i + 1].trim() !== "" && !NUMBERED_QUESTION.test(all[i + 1].trim()) && !/^(#{1,6}\s|---)/.test(all[i + 1].trim())) {
      text.push(all[++i].trim());
    }
    if (!found.has(start[1])) found.set(start[1], text.join("\n").trim());
  }
  return found;
}

/**
 * A quiz written as numbered questions (`**Q1.** …`) with the answers further down under an
 * "Answer key" heading: each question is paired with the answer that has the same number.
 */
const answerKey: CardRule = ({ node }) => {
  const all = lines(stripCode(node.body));
  const keyAt = all.findIndex((line) => ANSWER_KEY_HEADING.test(line.trim()));
  if (keyAt === -1) return [];
  const questions = numbered(all.slice(0, keyAt));
  const answers = numbered(all.slice(keyAt + 1));
  const drafts: CardDraft[] = [];
  for (const [number, question] of questions) {
    const answer = answers.get(number);
    if (answer && answer.length >= MIN_ANSWER_LENGTH) drafts.push({ front: question, back: answer, type: "qa" });
  }
  return drafts;
};

function splitOnce(text: string, separator: string): [string, string] | null {
  const at = text.indexOf(separator);
  if (at <= 0) return null;
  return [text.slice(0, at).trim(), text.slice(at + separator.length).trim()];
}

/** `term:: definition` and `question ? answer` one-liners. */
const inline: CardRule = ({ node }) => {
  const drafts: CardDraft[] = [];
  for (const raw of lines(node.body)) {
    const text = raw.trim().replace(/^[-*]\s+/, "");
    // Numbered quiz lines belong to the answer-key rule: a "?" inside one is not a question mark to split on.
    if (!text || text.startsWith("|") || text.startsWith(">") || NUMBERED_QUESTION.test(text)) continue;
    const field = text.includes(":::") ? null : splitOnce(text, "::");
    if (field && field[1].length >= MIN_ANSWER_LENGTH) {
      drafts.push({ front: field[0], back: field[1], type: "definition" });
      continue;
    }
    const question = splitOnce(text, " ? ");
    if (question && question[1].length >= MIN_ANSWER_LENGTH) {
      drafts.push({ front: `${question[0]}?`, back: question[1], type: "qa" });
    }
  }
  return drafts;
};

const BOLD_TERM_COLON_INSIDE = /^(?:[-*]\s+)?\*\*([^*]+?):\*\*\s+(.+)$/;
const BOLD_TERM_SEPARATED = /^(?:[-*]\s+)?\*\*([^*]+?)\*\*\s*(?::|—|–| -)\s+(.+)$/;
const QA_LABEL = /^(q|question|a|answer)$/i;

/** `**Term**: definition` (also with — or -), alone on a line or list item. */
const boldTerms: CardRule = ({ node }) => {
  const drafts: CardDraft[] = [];
  for (const raw of lines(node.body)) {
    const text = raw.trim();
    const match = text.match(BOLD_TERM_COLON_INSIDE) ?? text.match(BOLD_TERM_SEPARATED);
    if (!match || QA_LABEL.test(match[1].trim())) continue;
    if (match[2].trim().length >= MIN_DEFINITION_LENGTH && !isCodeList(match[2])) {
      drafts.push({ front: match[1].trim(), back: match[2].trim(), type: "definition" });
    }
  }
  return drafts;
};

function cells(row: string): string[] {
  // `\|` is a literal pipe inside a cell (Obsidian needs it for [[link\|alias]] in tables).
  return row.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim().replace(/\\\|/g, "|"));
}

const SHORT_CODE = /\b[A-Z]{1,2}\d+\b/g;
/** A first column that says where something is, not what it is: such a table is a log, not study material. */
const LOCATOR_HEADER = /^(where|location|page|pages|slide|slides|ref|reference|source|date|when|#|no\.?|file|link)$/i;
/** A section in which most lines are tick-boxes is a to-do list. */
const CHECKLIST_SHARE = 0.5;
const TASK_LINE = /^\s*[-*]\s*\[[ xX/?-]\]/;

/** True for a cell that only points somewhere else: links, numbers, codes like "N2", no words of its own. */
function isReferenceOnly(cell: string): boolean {
  return cell.replace(WIKILINK, "").replace(SHORT_CODE, "").replace(/[\d\s.,;:·|()–—-]/g, "") === "";
}

/** True for a cell that only names a part of the course ("Topic 5", "Week 3"): it says where, not what to recall. */
export function isSectionLabel(cell: string): boolean {
  return /^(?:topic|week|wk|chapter|ch|node|unit|module|lecture|lec|part|section|session|class)\.?\s*\d{1,3}[a-z]?$/i.test(cell.replace(/[*_`]/g, "").trim());
}

/** Columns of a grading or tracking table: what a thing is worth, when it is due, whether it is done. */
const ADMIN_HEADER = /^(weight|weighting|worth|marks|grade|%|due|due date|deadline)$/i;

/**
 * True for a table that runs the course instead of teaching it: one with a grading or
 * deadline column, or one whose only answers are yes/no ticks ("On sheet?", "Done?").
 */
export function isAdminTable(headers: string[]): boolean {
  const plain = headers.map((header) => header.replace(/[*_`]/g, "").trim());
  return plain.some((header) => ADMIN_HEADER.test(header)) || plain.slice(1).every((header) => header.endsWith("?"));
}

/** True for text that is only a list of problem or slide codes ("L1-2, Ch6-P5, VG1-1"): a pointer, not an answer. */
export function isCodeList(text: string): boolean {
  return text.replace(WIKILINK, "").replace(/\b[A-Za-z]{1,4}\d+[A-Za-z]?\b/g, "").replace(/[^\p{L}]/gu, "") === "";
}

/** A section too long to recall whole, once it also holds sections of its own. */
const NESTED_SECTION_WORDS = 60;

/**
 * True for a section that is a container, not an idea: mostly a table (tables have their own
 * rule, and one it passed over is a log), or a run of sub-headings with their own content.
 */
export function isContainerSection(text: string): boolean {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return false;
  if (lines.filter((line) => /^\s*\|/.test(line)).length > lines.length / 2) return true;
  return lines.some((line) => /^#{1,6}\s/.test(line)) && text.split(/\s+/).length > NESTED_SECTION_WORDS;
}

/**
 * Every table row: first column is the prompt, the other columns are the answer.
 * Navigation tables (trackers, maps of content) are skipped: a prompt that is just a number
 * or a link asks nothing, and an answer that is only links answers nothing.
 */
const tables: CardRule = ({ node }) => {
  const drafts: CardDraft[] = [];
  const tableRegex = /^(\|.+\|)[ \t]*\n\|[-| :]+\|[ \t]*\n((?:\|.+\|[ \t]*\n?)+)/gm;
  for (const match of stripCode(node.body).matchAll(tableRegex)) {
    const headers = cells(match[1]);
    if (headers.length < 2 || !headers[0] || LOCATOR_HEADER.test(headers[0].replace(/\*/g, "").trim())) continue;
    if (isAdminTable(headers)) continue;
    for (const row of match[2].trim().split("\n")) {
      const values = cells(row);
      const answer = values
        .slice(1)
        .map((value, i) => (value && !isReferenceOnly(value) ? `${headers[i + 1] || ""}: ${value}` : ""))
        .filter(Boolean);
      if (values[0] && !isReferenceOnly(values[0]) && !isSectionLabel(values[0]) && answer.length > 0) {
        drafts.push({ front: `${headers[0]}: ${values[0]}`, back: answer.join(" | "), type: "table-row" });
      }
    }
  }
  return drafts;
};

/** Headings as prompts. Used only for notes where no other rule found a card. */
const headings: CardRule = ({ node, sections }) => {
  const drafts: CardDraft[] = [];
  for (const [heading, body] of Object.entries(sections)) {
    if (heading === "__intro__") continue;
    const text = stripCode(body).trim();
    if (text.length < HEADING_BODY_MIN || text.length > HEADING_BODY_MAX) continue;
    const filled = text.split("\n").filter((line) => line.trim() !== "");
    if (filled.filter((line) => TASK_LINE.test(line)).length > filled.length * CHECKLIST_SHARE) continue;
    // A section that is only a list of links or checkboxes is navigation, not something to recall.
    const ownWords = text.replace(WIKILINK, "").replace(/^\s*[-*]\s*(\[.\])?/gm, "").replace(/[^\p{L}]/gu, "");
    if (ownWords.length < HEADING_BODY_MIN) continue;
    if (isContainerSection(text)) continue;
    drafts.push({ front: `${node.title} — ${heading}`, back: text, type: "heading" });
  }
  return drafts;
};

export const genericRules: Record<string, CardRule> = {
  callouts,
  "answer-key": answerKey,
  qa,
  inline,
  "bold-terms": boldTerms,
  tables,
  headings,
};

export const GENERIC_DEFAULT_SOURCES = ["callouts", "answer-key", "qa", "inline", "bold-terms", "tables", "headings"];

/** Rules that only run when a note produced nothing else. */
export const FALLBACK_SOURCES = new Set(["headings"]);
