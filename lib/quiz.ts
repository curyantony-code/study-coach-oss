import type { WikiPage } from "./wiki";

export interface QuizQuestion {
  id: string;
  stem: string;
  options: { text: string; correct: boolean }[];
  explanation: string;
  sourceSlug: string;
  tags: string[];
  /** Set when the question was made from one study card: answering it counts as reviewing that card. */
  cardId?: string;
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getEntityPages(pages: WikiPage[]): WikiPage[] {
  return pages.filter((p) => p.type === "entity");
}

function extractFirstSentence(text: string): string {
  const match = text.match(/[^.!?]+[.!?]/);
  return match ? match[0].trim() : text.slice(0, 120).trim();
}

// Pattern A: table-row MCQs from entity pages
function patternA(page: WikiPage, allEntities: WikiPage[]): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  const tableRegex = /\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/g;
  let m: RegExpExecArray | null;

  while ((m = tableRegex.exec(page.rawContent)) !== null) {
    const headers = m[1].split("|").map((c) => c.trim()).filter(Boolean);
    if (headers.length < 2) continue;
    const isUseful = headers.some((h) =>
      /component|level|step|stage|type|factor|element|cue/i.test(h)
    );
    if (!isUseful) continue;

    const rows = m[2].trim().split("\n");
    for (const row of rows) {
      const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const component = cells[0];
      const definition = cells[1];
      if (component.length < 3 || definition.length < 5) continue;

      // Distractors: other rows in same table + similar entities
      const otherRows = rows
        .filter((r) => r !== row)
        .map((r) => r.split("|").map((c) => c.trim()).filter(Boolean)[1])
        .filter(Boolean)
        .filter((d): d is string => typeof d === "string" && d.length > 5)
        .slice(0, 2);

      const sibling = allEntities
        .filter((e) => e.slug !== page.slug && e.tags.some((t) => page.tags.includes(t)))
        .slice(0, 1)
        .map((e) => e.title);

      const distractors = [...otherRows, ...sibling].slice(0, 3);
      if (distractors.length < 2) continue;

      const options = shuffle([
        { text: component, correct: true },
        ...distractors.map((d) => ({ text: d, correct: false })),
      ]).slice(0, 4);

      questions.push({
        id: hashStr(`A-${page.slug}-${component}`),
        stem: `In ${page.title}, which ${headers[0].toLowerCase()} best fits this description: "${definition}"?`,
        options,
        explanation: `"${component}" — ${definition}`,
        sourceSlug: page.slug,
        tags: page.tags,
      });
    }
  }
  return questions;
}

// Pattern B: "Which theory?" from entity titles
function patternB(entities: WikiPage[]): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  const tagGroups = new Map<string, WikiPage[]>();

  for (const e of entities) {
    for (const tag of e.tags) {
      if (!tagGroups.has(tag)) tagGroups.set(tag, []);
      tagGroups.get(tag)!.push(e);
    }
  }

  for (const e of entities) {
    const intro = e.sections["What It Is"] || e.sections["What it is"] || e.sections["__intro__"] || "";
    if (!intro) continue;
    const firstSentence = extractFirstSentence(intro);
    if (firstSentence.length < 20) continue;

    // Find distractors from same tag group
    const sameTag = e.tags
      .flatMap((t) => tagGroups.get(t) || [])
      .filter((p) => p.slug !== e.slug);
    const distractors = [...new Map(sameTag.map((p) => [p.slug, p])).values()]
      .slice(0, 3)
      .map((p) => ({ text: p.title, correct: false }));

    if (distractors.length < 2) continue;

    const options = shuffle([
      { text: e.title, correct: true },
      ...distractors,
    ]).slice(0, 4);

    questions.push({
      id: hashStr(`B-${e.slug}`),
      stem: `Which theory or model is described here: "${firstSentence}"?`,
      options,
      explanation: `${e.title}: ${firstSentence}`,
      sourceSlug: e.slug,
      tags: e.tags,
    });
  }
  return questions;
}

// Pattern C: misconception True/False
function patternC(entities: WikiPage[]): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  for (const e of entities) {
    const section =
      e.sections["Common Misconceptions"] ||
      e.sections["Common misconceptions"] ||
      "";
    if (!section) continue;
    const lines = section.split("\n").filter((l) => l.match(/^[-*]\s/));
    for (const line of lines) {
      const text = line.replace(/^[-*]\s+/, "").trim();
      if (text.length < 10) continue;

      const [myth, fact] = text.includes(" — ") ? text.split(" — ") : [text, ""];

      questions.push({
        id: hashStr(`C-${e.slug}-${myth}`),
        stem: `True or False: "${myth}"`,
        options: [
          { text: "False", correct: true },
          { text: "True", correct: false },
        ],
        explanation: fact
          ? `False. ${fact}`
          : `This is a misconception about ${e.title}.`,
        sourceSlug: e.slug,
        tags: e.tags,
      });
    }
  }
  return questions;
}

export function generateStaticQuiz(
  pages: WikiPage[],
  topic?: string,
  count = 10
): QuizQuestion[] {
  const entities = getEntityPages(pages);
  const all: QuizQuestion[] = [];

  for (const e of entities) {
    all.push(...patternA(e, entities));
  }
  all.push(...patternB(entities));
  all.push(...patternC(entities));

  let filtered = all;
  if (topic) {
    const t = topic.toLowerCase();
    filtered = all.filter(
      (q) =>
        q.tags.some((tag) => tag.toLowerCase().includes(t)) ||
        q.stem.toLowerCase().includes(t) ||
        q.sourceSlug.toLowerCase().includes(t)
    );
    if (filtered.length < 3) filtered = all; // fallback
  }

  return shuffle(filtered).slice(0, count);
}

// ── Questions from study cards ──────────────────────────────────────────────

const MAX_OPTION_LENGTH = 220;
const DISTRACTORS = 3;

/** The part of a study card a quiz question needs. */
export interface QuizCard {
  id: string;
  front: string;
  back: string;
  source: string;
  tags: string[];
  type: string;
}

const SYMBOL_HEADER = /^(symbol|notation|variable|letter|abbreviation|acronym)s?$/i;
const TERM_HEADER = /^(term|concept|word|key term|vocabulary)s?$/i;
const MEANING_HEADER = /^(meaning|definition|description|what it (is|means)|stands for|explanation|name)s?$/i;
/** A front that only says where something is ("Topic 5", "N1 s.17", "Answer: b") asks nothing. */
const LOCATOR_FRONT = /^(?:(?:topic|week|chapter|node|class|lecture|ch|n|t)\.?\s*\d+\b.{0,24}|answer\b.{0,12}|sources?|purpose|quick rules)$/i;

const plain = (text: string) => text.replace(/\*\*|__/g, "").trim();

interface TableRow {
  /** Header of the first column, and this row's value in it. */
  kind: string;
  subject: string;
  /** Header and value of the first answer column: the one the question asks about. */
  asked: string;
  answer: string;
}

/** A card made from a table row ("Symbol: Q" → "Meaning: quantity | Units: tonnes"), taken apart again. */
export function tableRow(card: Pick<QuizCard, "front" | "back" | "type">): TableRow | null {
  if (card.type !== "table-row") return null;
  const front = card.front.match(/^([^:]{1,40}):\s+([\s\S]+)$/);
  const first = card.back.split(" | ")[0].match(/^([^:]{0,40}):\s+([\s\S]+)$/);
  if (!front || !first) return null;
  return { kind: plain(front[1]), subject: plain(front[2]), asked: plain(first[1]), answer: first[2].trim() };
}

/** "Challenge" → "challenge", but "AI opportunity" keeps its capitals. */
function inSentence(header: string): string {
  return /^[A-Z]{2,}\b/.test(header) ? header : header[0].toLowerCase() + header.slice(1);
}

/** The question a table row asks, in a full sentence. */
export function tableQuestion(row: TableRow): string {
  // A first column that is already a question is asked as it stands.
  if (row.subject.endsWith("?")) return row.subject;
  if (SYMBOL_HEADER.test(row.kind)) return `What does the ${row.kind.toLowerCase()} ${row.subject} stand for?`;
  if (TERM_HEADER.test(row.kind) && (MEANING_HEADER.test(row.asked) || row.asked === "")) return `What does “${row.subject}” mean?`;
  if (row.asked === "") return `Which of these goes with the ${row.kind.toLowerCase()} “${row.subject}”?`;
  if (MEANING_HEADER.test(row.asked)) return `${row.kind}: ${row.subject}. Which ${inSentence(row.asked)} fits it?`;
  return `${row.kind}: ${row.subject}. What is its ${inSentence(row.asked)}?`;
}

const TRUE_FALSE = /^true or false\b/i;

function asQuestion(front: string): string {
  const text = front.trim();
  return /[?:]$/.test(text) || TRUE_FALSE.test(text) || text.length > 90 ? text : `Which of these best matches “${text}”?`;
}

/** Cards that can be asked as a question at all. */
function askable(card: QuizCard): boolean {
  const front = plain(card.front);
  if (card.type === "problem" || front.length < 3 || card.back.trim().length < 2) return false;
  // A highlight that repeats itself, a table pasted as an answer, a front that is only a place.
  if (front === plain(card.back) || /\|\s*-{3,}/.test(card.back) || LOCATOR_FRONT.test(front)) return false;
  return true;
}

interface Asked {
  card: QuizCard;
  stem: string;
  answer: string;
  /** Cards with the same key come from the same table: their answers are the best wrong options. */
  family: string | null;
}

function ask(card: QuizCard): Asked {
  const row = tableRow(card);
  if (!row) return { card, stem: asQuestion(card.front), answer: card.back.trim(), family: null };
  return { card, stem: tableQuestion(row), answer: row.answer, family: `${card.source}|${row.kind}|${row.asked}`.toLowerCase() };
}

/**
 * Multiple-choice questions made straight from study cards: the card's answer against three
 * other cards' answers. Works for any vault, because every vault has cards.
 * Worked problems are left out: their answers are full solutions, not options to pick from.
 * A table row is asked about its first answer column, against other rows of the same table.
 */
export function quizFromCards(cards: QuizCard[], count: number, topic?: string): QuizQuestion[] {
  if (count <= 0) return [];
  const usable = cards.filter(askable).map(ask).filter((a) => a.answer.length >= 2 && a.answer.length <= MAX_OPTION_LENGTH);
  let pool = usable;
  if (topic) {
    const t = topic.toLowerCase();
    const matching = usable.filter(({ card }) => `${card.front} ${card.source} ${card.tags.join(" ")}`.toLowerCase().includes(t));
    if (matching.length >= 3) pool = matching;
  }
  const questions: QuizQuestion[] = [];
  for (const asked of shuffle(pool)) {
    if (questions.length >= count) break;
    const { card, answer } = asked;
    // A true-or-false card is answered with True or False, not with four explanations.
    const verdict = TRUE_FALSE.test(card.front.trim()) ? answer.match(/^(true|false)\b/i)?.[1].toLowerCase() : undefined;
    if (verdict) {
      questions.push({
        id: hashStr(`card:${card.id}`),
        stem: asked.stem,
        options: [{ text: "True", correct: verdict === "true" }, { text: "False", correct: verdict === "false" }],
        explanation: answer,
        sourceSlug: card.source,
        tags: card.tags,
        cardId: card.id,
      });
      continue;
    }
    // Wrong options, most believable first: the same table, then the same kind of card.
    const closeness = (other: Asked) => (asked.family !== null && other.family === asked.family ? 2 : other.card.type === card.type ? 1 : 0);
    const others = [...new Set(
      shuffle(usable.filter((o) => o.card.id !== card.id && o.answer !== answer)).sort((a, b) => closeness(b) - closeness(a)).map((o) => o.answer)
    )];
    if (others.length < DISTRACTORS) continue;
    questions.push({
      id: hashStr(`card:${card.id}`),
      stem: asked.stem,
      options: shuffle([{ text: answer, correct: true }, ...others.slice(0, DISTRACTORS).map((text) => ({ text, correct: false }))]),
      explanation: `The answer in your notes: ${card.back.trim()}`,
      sourceSlug: card.source,
      tags: card.tags,
      cardId: card.id,
    });
  }
  return questions;
}
