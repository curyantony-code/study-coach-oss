// Teach-back (docs/ARCHITECTURE.md: explaining helps when students expect to teach).
// The student explains a note from memory; the AI compares it with the note and says what
// was covered and what was missed. If no AI answers, the student rates themselves against
// the note's key points instead.
import { z } from "zod";
import type { Card, Node } from "../vault/types";

export const MIN_EXPLANATION_LENGTH = 40;
export const MAX_EXPLANATION_LENGTH = 6000;
const MAX_KEY_POINTS = 10;

/**
 * A real number from 0 to 100, or the same written as digits. Anything else (null, "", a
 * list, a 0–1 fraction such as 0.85) is not a score: guessing what the model meant would
 * turn a malformed reply into a grade.
 */
const scoreSchema = z
  .union([z.number(), z.string().regex(/^\d{1,3}$/).transform(Number)])
  .refine((n) => Number.isFinite(n) && n >= 0 && n <= 100 && (Number.isInteger(n) || n >= 1), "score must be 0-100")
  .transform(Math.round);

export const gradeSchema = z.object({
  score: scoreSchema,
  covered: z.array(z.string().min(1).max(300)).max(20).default([]),
  missing: z.array(z.string().min(1).max(300)).max(20).default([]),
  tip: z.string().max(600).default(""),
});

export type Grade = z.infer<typeof gradeSchema>;

export function gradeSystemPrompt(courseName: string): string {
  return `You grade a student's from-memory explanation of one topic in ${courseName} against the course's own note on it.

Judge only what the note covers. Be fair and specific: credit ideas the student got right in their own words, and name the important ideas they left out or got wrong. Do not reward length or vocabulary on their own.

Reply with ONLY a JSON object, no other text, in exactly this shape:
{"score": <integer 0-100, the share of the note's important ideas explained correctly>, "covered": [<short phrases: ideas explained correctly>], "missing": [<short phrases: important ideas left out or wrong>], "tip": "<one sentence: the single most useful thing to fix next>"}

Write any maths in LaTeX with dollar signs. Keep every phrase under 15 words.`;
}

export function gradeUserPrompt(node: Pick<Node, "title" | "body">, explanation: string): string {
  return `<note title="${node.title.replace(/"/g, "'")}">\n${node.body}\n</note>\n\n<student_explanation>\n${explanation.trim()}\n</student_explanation>`;
}

/** Pulls the JSON object out of a model reply (which may wrap it in a code fence or add a sentence) and validates it. */
export function parseGrade(reply: string): Grade | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = gradeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** What the note is about, for self-rating when no AI is available: its card prompts. */
export function keyPoints(nodeId: string, cards: Card[]): string[] {
  const fronts = cards.filter((c) => c.nodeId === nodeId && c.type !== "problem").map((c) => c.front);
  return [...new Set(fronts)].slice(0, MAX_KEY_POINTS);
}

/** Self-rating buttons map to a score so progress has one scale either way. */
export const SELF_RATINGS = [
  { id: "most", label: "Most of them", score: 85 },
  { id: "some", label: "About half", score: 55 },
  { id: "few", label: "Only a few", score: 25 },
] as const;

export type ScoreBand = "strong" | "middling" | "weak";

export function scoreBand(score: number): ScoreBand {
  if (score >= 70) return "strong";
  return score >= 40 ? "middling" : "weak";
}
