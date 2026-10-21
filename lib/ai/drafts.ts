// AI-drafted study cards. Drafts are only ever proposed: the owner reviews them, and saving
// writes them to `_study-drafts/` (never into a note), where the app does not read them
// back as study content until the owner moves them.
import { SELF_CONTAINED_RULE } from "../questions/rules";
import type { Node } from "../vault/types";

export const MAX_DRAFT_CARDS = 12;

export interface DraftCard {
  question: string;
  answer: string;
}

export function draftSystemPrompt(courseName: string): string {
  return `You write study flashcards for ${courseName} from one of the course's own notes.

Write up to ${MAX_DRAFT_CARDS} cards covering the note's most important ideas. Each card asks one thing and can be answered from the note alone. Prefer "why" and "how" questions and applying an idea over copying a definition. Do not invent facts that are not in the note. Ask about the subject matter only: never about the note itself (its title, tags, headings, links or layout).

${SELF_CONTAINED_RULE}

Reply with ONLY the cards, in exactly this format, with a blank line between cards:
Q: <question>
A: <answer in one to three sentences>

Write maths in LaTeX with dollar signs.`;
}

export function draftUserPrompt(node: Pick<Node, "title" | "body">): string {
  return `<note title="${node.title.replace(/"/g, "'")}">\n${node.body}\n</note>`;
}

/** Reads "Q: … / A: …" pairs out of a model reply, ignoring anything else it wrote. */
export function parseDrafts(reply: string): DraftCard[] {
  const cards: DraftCard[] = [];
  // An answer runs to the next blank line, the next question, or the end of the reply.
  const pair = /^\s*(?:\d+[.)]\s*)?(?:\*\*)?Q(?:uestion)?\s*[:.](?:\*\*)?\s*(.+?)\s*\n+\s*(?:\*\*)?A(?:nswer)?\s*[:.](?:\*\*)?\s*([\s\S]+?)(?=\n\s*\n|\n\s*(?:\*\*)?Q(?:uestion)?\s*[:.]|(?![\s\S]))/gim;
  for (const match of reply.matchAll(pair)) {
    const question = match[1].trim();
    const answer = match[2].trim().replace(/\s*\n\s*/g, " ");
    if (question.length >= 5 && answer.length >= 2) cards.push({ question, answer });
  }
  return cards.slice(0, MAX_DRAFT_CARDS);
}

/** The file saved to `_study-drafts/`: plain "Q:/A:" pairs the app's card rules already understand. */
export function formatDraftFile(noteTitle: string, cards: DraftCard[], day: string): string {
  const header = [
    `# Draft cards for [[${noteTitle}]]`,
    "",
    `> Drafted by AI on ${day}. Check each card against your notes, fix or delete as needed,`,
    "> then move the ones you want into the note itself. Cards in this folder are not studied.",
    "",
  ].join("\n");
  return `${header}\n${cards.map((c) => `Q: ${c.question}\nA: ${c.answer}`).join("\n\n")}\n`;
}

/** A safe file name for a note's drafts: letters, digits and dashes only. */
export function draftFileName(noteTitle: string): string {
  const base = noteTitle
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "note"}-drafts.md`;
}

const MAX_DRAFT_FILES = 20;

/** Candidate file names for a note's drafts, first choice first: "X-drafts.md", "X-drafts-2.md", … */
export function draftFileNames(noteTitle: string): string[] {
  const first = draftFileName(noteTitle);
  return [first, ...Array.from({ length: MAX_DRAFT_FILES - 1 }, (_, i) => first.replace(/\.md$/, `-${i + 2}.md`))];
}
