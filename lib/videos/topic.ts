// Reads a note (or one section of it) and works out what to search for, and how well a
// video's title and description line up with it. No AI involved: the note's own headings
// and bolded terms say what the topic is.
import { extractProblems } from "../vault/cards/problem-rule";
import { parseSections } from "../vault/notes";
import type { Card, Node } from "../vault/types";

const MAX_TERMS = 8;
const MIN_SECTION_PROSE = 80;
const STRONG_MATCH = 0.5;
const PARTIAL_MATCH = 0.25;
/** Bold text that labels a line rather than naming an idea. */
const LABELS = /^(problem|solution|formula required|example|note|tip|warning|answer|hint|definition|proof|drill|evidence|summary)\b/i;
const STOPWORDS = new Set(
  "a an and are as at be by for from how in into is it its of on or that the their this to vs versus was what when which why with your you we i not no can do does than then there these those over under between per each via using use used".split(" ")
);

export interface Topic {
  /** "" for the whole note, otherwise the section heading. */
  section: string;
  /** What the topic is called, without course codes: "Two Risky Assets". */
  name: string;
  /** The note's subject, for context: "Portfolio Selection". */
  subject: string;
  /** Ideas the content covers, most prominent first. */
  terms: string[];
}

/** "FIN 101 - Node 2 - Portfolio Selection" → "Portfolio Selection". */
export function subjectOf(noteTitle: string): string {
  const cleaned = noteTitle
    .replace(/^[A-Z]{2,5}\s?\d{2,4}[A-Z]?\s*[-–—:]\s*/, "")
    .replace(/^(node|topic|week|wk|lecture|unit|module|ch(apter)?)\s*\d+\s*[-–—:]\s*/i, "")
    .replace(/^ch(apter)?\s*\d+\s*[-–—:]\s*/i, "")
    .trim();
  return cleaned || noteTitle.trim();
}

/** Strips formulas, code and markdown so only readable words remain. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/!?\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target: string, alias?: string) => alias ?? target)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTerm(raw: string): string {
  // "Systematic (market) risk" is searched and matched as "Systematic risk".
  return plainText(raw).replace(/\s*\([^)]*\)/g, "").replace(/[.:;,]+$/, "").replace(/\s+/g, " ").trim();
}

function isUsefulTerm(term: string): boolean {
  const words = term.split(/\s+/);
  return term.length >= 3 && term.length <= 50 && words.length <= 6 && /[a-z]{3}/i.test(term) && !LABELS.test(term);
}

/** Column headings that describe the table's layout rather than name an idea. */
const GENERIC_HEADERS = /^(symbol|meaning|node|owner|formula|expression|type|example|chapter|assigned|notes?|description|definition|term|concept|#|name|item|step|stage|strategy|theory|framework|rule|method|form|view|input|context|situation|cost|label|sheet label|owning section|purpose|claim|implication|construction|weight|time|activities)s?$/i;
/** Sections that organise the note rather than explain something. */
const HOUSEKEEPING = /\b(glossary|variables|exam traps?|practice|scenarios|problems|references|see also|related|sources|checklist|tracker)\b/i;
const MAX_TABLE_TERMS = 5;

function tableTerms(markdown: string): string[] {
  const terms: string[] = [];
  const table = /^\|(.+)\|[ \t]*\n\|[-| :]+\|[ \t]*\n((?:\|.+\|[ \t]*\n?)+)/gm;
  for (const match of markdown.matchAll(table)) {
    const headers = match[1].split(/(?<!\\)\|/).map(cleanTerm);
    if (headers.length < 2) continue;
    // "| Strategy | Construction |": the rows name the ideas. "| Systematic risk | Unsystematic risk |": the columns do.
    if (GENERIC_HEADERS.test(headers[0])) {
      const firstCells = match[2].trim().split("\n").map((row) => cleanTerm(row.split(/(?<!\\)\|/)[1] ?? ""));
      terms.push(...firstCells.slice(0, MAX_TABLE_TERMS));
    } else {
      terms.push(...headers.filter((h) => !GENERIC_HEADERS.test(h)));
    }
  }
  return terms;
}

/**
 * The ideas a passage is about, strongest signal first: sub-headings, what its tables are
 * organised around, terms being defined (bold at the start of a line or followed by a colon
 * or dash), and only then other bold text, which is often just emphasis.
 */
export function keyTerms(markdown: string, exclude: string[] = []): string[] {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, " ");
  const subHeadings = [...withoutCode.matchAll(/^#{3,6}\s+(.+)$/gm)].map((m) => m[1]);
  const defined = [...withoutCode.matchAll(/(?:^|\n)\s*(?:[-*]\s+)?\*\*([^*\n]+)\*\*|\*\*([^*\n]+)\*\*(?=\s*(?::|—|–|\(| is | are | means ))/g)].map((m) => m[1] ?? m[2]);
  const bold = [...withoutCode.matchAll(/\*\*([^*\n]+)\*\*/g)].map((m) => m[1]);
  const skip = new Set(exclude.map((e) => e.toLowerCase()));
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of [...subHeadings, ...tableTerms(withoutCode), ...defined, ...bold]) {
    const term = cleanTerm(raw);
    const key = term.toLowerCase();
    if (!isUsefulTerm(term) || seen.has(key) || skip.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms.slice(0, MAX_TERMS);
}

/** The parts of a note worth finding a video for: the whole note, then each `##` section with real content. */
export function topicsOf(node: Pick<Node, "title" | "body">): Topic[] {
  const subject = subjectOf(node.title);
  // Worked problems are practice, not an explanation to look up.
  const body = extractProblems(node.body).remainingBody;
  const whole: Topic = { section: "", name: subject, subject, terms: keyTerms(body, [subject]) };
  const sections = Object.entries(parseSections(body))
    .filter(([heading, text]) => heading !== "__intro__" && !HOUSEKEEPING.test(heading) && plainText(text).length >= MIN_SECTION_PROSE)
    .map(([heading, text]) => {
      const name = cleanTerm(heading);
      return { section: heading, name, subject, terms: keyTerms(text, [name, subject]) };
    });
  return [whole, ...sections];
}

const PROBLEM_NUMBER = /^Ch\d+-(?:P|CFA)\d+(?:\s*(?:to|and|[-–,])\s*(?:Ch\d+-)?(?:P|CFA)?\d+)*\s*/i;
const SNIPPET_LENGTH = 30;

/**
 * What to look up for one study card. A worked problem is searched by what it is called
 * ("Graphical Tangency"); any other card by the section of the note it was made from.
 */
export function topicForCard(node: Pick<Node, "title" | "body">, card: Pick<Card, "front" | "back" | "problem">): Topic {
  const [whole, ...sections] = topicsOf(node);
  if (card.problem) {
    const name = cleanTerm(card.problem.heading.replace(PROBLEM_NUMBER, ""));
    if (!name) return whole;
    return { section: card.problem.heading, name, subject: whole.subject, terms: keyTerms(card.back, [name, whole.subject]) };
  }
  const text = parseSections(node.body);
  const snippets = [card.back, card.front].map((t) => t.trim().slice(0, SNIPPET_LENGTH)).filter((t) => t.length >= 8);
  return sections.find((topic) => snippets.some((snippet) => text[topic.section]?.includes(snippet))) ?? whole;
}

/**
 * Search phrasings for a topic, best first. Later ones are the "different wording" to fall
 * back on when the first results do not line up with the content.
 */
export function buildQueries(topic: Topic): string[] {
  const context = topic.name.toLowerCase() === topic.subject.toLowerCase() ? "" : ` ${topic.subject}`;
  const leading = topic.terms.slice(0, 3).join(" ");
  const queries = [
    `${topic.name}${context} explained`,
    leading ? `${leading}${context || ` ${topic.subject}`} explained` : "",
    `${topic.name}${context} lecture`,
    topic.terms[0] ? `${topic.terms[0]} ${topic.name} tutorial` : "",
  ];
  return [...new Set(queries.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function stem(word: string): string {
  return word.length > 4 ? word.replace(/(ies|es|s)$/, "") : word;
}

export function significantWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9']*/g) ?? []).filter((w) => w.length > 2 && !STOPWORDS.has(w)).map(stem);
}

export type MatchLabel = "strong" | "partial" | "weak";

export interface MatchResult {
  /** 0–1: how much of the topic the video's title and description mention. */
  score: number;
  label: MatchLabel;
  covers: string[];
  missing: string[];
}

export interface VideoText {
  title: string;
  description: string;
}

/**
 * Compares a video with the topic. The topic's name counts double (a video about something
 * else that happens to mention a term is not a match), and a term counts when all of its
 * meaningful words appear in the title or description.
 */
export function matchVideo(video: VideoText, topic: Topic): MatchResult {
  const titleWords = new Set(significantWords(video.title));
  const allWords = new Set([...titleWords, ...significantWords(video.description)]);
  const nameWords = significantWords(topic.name);
  const nameShare = nameWords.length === 0 ? 0 : nameWords.filter((w) => titleWords.has(w)).length / nameWords.length;
  const mentioned = (term: string) => {
    const words = significantWords(term);
    return words.length > 0 && words.every((w) => allWords.has(w));
  };
  const covers = topic.terms.filter(mentioned);
  const missing = topic.terms.filter((t) => !mentioned(t));
  const score = (covers.length + 2 * nameShare) / (topic.terms.length + 2);
  return { score, label: score >= STRONG_MATCH ? "strong" : score >= PARTIAL_MATCH ? "partial" : "weak", covers, missing };
}

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
