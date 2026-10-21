// AI-written wordings of worked examples' questions: one in full, one condensed. Kept in the
// app's database, never in the vault, and tied to the note's text so an edited note is not
// shown a stale rewrite.
import type { Db } from "../db/client";
import { getSetting, setSetting } from "../vault/registry";
import type { Card } from "../vault/types";

export const COMPLETED_SOURCE = "Written out in full by AI from the worked solution in your notes";
export const CONDENSED_SOURCE = "Condensed by AI to what you need to solve it";

/** Which wording of a question the student sees. Full is the default. */
export const QUESTION_STYLES = ["full", "condensed", "notes"] as const;
export type QuestionStyle = (typeof QUESTION_STYLES)[number];
const STYLE_KEY = "question-style";

export function getQuestionStyle(db: Db): QuestionStyle {
  const value = getSetting(db, STYLE_KEY);
  return QUESTION_STYLES.includes(value as QuestionStyle) ? (value as QuestionStyle) : "full";
}

export function setQuestionStyle(db: Db, style: QuestionStyle): void {
  setSetting(db, STYLE_KEY, style);
}

export interface QuestionFix {
  /** The question written out in full. */
  text: string;
  condensed: string | null;
  /** Fingerprint of the question and solution the rewrite was made from. */
  basis: string;
}

/** Changes whenever the note's question or solution changes. */
export function basisOf(question: string, solution: string): string {
  let h = 0;
  const text = `${question}\u0000${solution}`;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

export function getFixes(db: Db, vaultId: string): Map<string, QuestionFix> {
  const rows = db.prepare("SELECT card_id, text, condensed, basis FROM question_fixes WHERE vault_id = ?").all(vaultId) as unknown as {
    card_id: string;
    text: string;
    condensed: string | null;
    basis: string;
  }[];
  return new Map(rows.map((r) => [r.card_id, { text: r.text, condensed: r.condensed, basis: r.basis }]));
}

export function saveFix(db: Db, vaultId: string, cardId: string, fix: QuestionFix, now: Date): void {
  db.prepare(
    "INSERT INTO question_fixes (vault_id, card_id, text, condensed, basis, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(vault_id, card_id) DO UPDATE SET text = excluded.text, condensed = excluded.condensed, basis = excluded.basis, created_at = excluded.created_at"
  ).run(vaultId, cardId, fix.text, fix.condensed, fix.basis, now.toISOString());
}

export function deleteFix(db: Db, vaultId: string, cardId: string): void {
  db.prepare("DELETE FROM question_fixes WHERE vault_id = ? AND card_id = ?").run(vaultId, cardId);
}

/**
 * Shows each problem in the student's chosen wording. Cards already showing the textbook's
 * wording are left alone, and a rewrite made from an older version of the note is ignored.
 * Whatever is shown, the other wordings travel with the card so the student can switch.
 */
export function withCompletedQuestions(cards: Card[], fixes: Map<string, QuestionFix>, style: QuestionStyle = "full"): Card[] {
  if (fixes.size === 0) return cards;
  return cards.map((card) => {
    const fix = fixes.get(card.id);
    if (!fix || card.type !== "problem" || !card.problem || card.problem.original) return card;
    if (fix.basis !== basisOf(card.front, card.back)) return card;
    const versions = { full: fix.text, condensed: fix.condensed, note: card.front };
    if (style === "notes") return { ...card, problem: { ...card.problem, versions } };
    const useCondensed = style === "condensed" && fix.condensed !== null;
    return {
      ...card,
      front: useCondensed ? fix.condensed! : fix.text,
      problem: {
        ...card.problem,
        versions,
        original: { source: useCondensed ? CONDENSED_SOURCE : COMPLETED_SOURCE, noteVersion: card.front, uncertain: false, completed: true },
      },
    };
  });
}

/** True when a problem still shows the note's own wording because no full version exists yet. */
export function needsWritingOut(card: Card): boolean {
  return card.type === "problem" && Boolean(card.problem) && !card.problem!.original && !card.problem!.versions;
}
