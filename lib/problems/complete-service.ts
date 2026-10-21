// Writing questions out with the AI. Called from plain API routes, never from server actions:
// a server action holds the page's action queue until it returns, and these calls take a
// minute or more, so navigation and other clicks would pile up behind them.
import { acceptPolish, briefSystemPrompt, briefUserPrompt, codeBrief, composeQuestion, mergeBriefs, POLISH_SYSTEM_PROMPT, readBrief } from "../ai/complete-question";
import { canStage, route, stage } from "../ai/pipeline";
import { getDb } from "../db/client";
import type { StudyContext } from "../learner/service";
import { questionIssues } from "../questions/rules";
import { forgetVaultIndex } from "../vault/store";
import type { Card, QuestionVersions } from "../vault/types";
import { missingDetails } from "./completeness";
import { basisOf, getFixes, needsWritingOut, saveFix } from "./fixes";

/** The note's own wording of a problem, whatever wording the card is showing now. */
export function noteQuestion(card: Card): string {
  return card.problem?.versions?.note ?? (card.problem?.original?.completed ? card.problem.original.noteVersion : card.front);
}

/** True when the card shows a textbook's wording: there is nothing for the AI to write out. */
export function hasTextbookWording(card: Card): boolean {
  return Boolean(card.problem?.original) && !card.problem!.original!.completed;
}

export type WriteOutResult = { ok: true; versions: QuestionVersions } | { ok: false; error: string };

// One request per problem at a time: opening the same problem twice, or the bulk writer
// reaching a problem that is already being written, shares the work instead of repeating it.
const inFlight = new Map<string, Promise<WriteOutResult>>();

/**
 * Step 3, in the background: a larger model turns the composed text into full sentences.
 * Nothing waits for it. Its wording replaces the composed one only if code verifies it and
 * the question has not been rewritten or discarded in the meantime.
 */
// Polishing runs one question at a time, so writing out a whole course never has dozens of
// cloud requests open at once.
let polishQueue: Promise<void> = Promise.resolve();

function queuePolish(vaultId: string, cardId: string, basis: string, composed: string): void {
  polishQueue = polishQueue
    .then(() => polishLater(vaultId, cardId, basis, composed, null))
    .catch((error) => console.error("Polishing a question failed", error));
}

async function polishLater(vaultId: string, cardId: string, basis: string, composed: string, condensed: string | null): Promise<void> {
  const reply = await stage(POLISH_SYSTEM_PROMPT, composed);
  const polished = reply ? acceptPolish(composed, reply) : null;
  if (!polished || polished === composed) return;
  const current = getFixes(getDb(), vaultId).get(cardId);
  if (!current || current.basis !== basis || current.text !== composed) return;
  saveFix(getDb(), vaultId, cardId, { text: polished, condensed: condensed ?? composed, basis }, new Date());
  forgetVaultIndex(vaultId);
}

async function write(ctx: StudyContext, card: Card, feedback: string | null): Promise<WriteOutResult> {
  const question = noteQuestion(card);
  // A question that says "same data" needs the question it leans on: the one before it in the note.
  const inNote = ctx.index.cards.filter((c) => c.nodeId === card.nodeId && c.type === "problem");
  const before = inNote[inNote.findIndex((c) => c.id === card.id) - 1];
  const item = { heading: card.problem!.heading, question, solution: card.back, formula: card.problem!.formula, previous: before ? noteQuestion(before) : null, feedback };

  // Step 1, RULES: code reads what the solution computes and what the question lacks. For most
  // questions that settles it with no AI at all.
  const issues = questionIssues(question, card.back, card.problem!.heading);
  const missing = missingDetails(question, card.back, card.problem!.heading);
  let brief = codeBrief(item);
  if (missing.length > 0) brief = { ...brief, givens: missing.map((span) => `a time frame of ${span}`) };
  let composed = composeQuestion(item, brief);

  // Step 2, ROUTER: the small local model is consulted only when code found a problem it could
  // not fix, or the student said something is missing. Code checks every item it offers.
  if (feedback || (issues.length > 0 && !composed)) {
    const routed = await route(briefSystemPrompt(ctx.index.course.name), briefUserPrompt(item), (reply) => readBrief(item, reply));
    if (routed.ok) composed = composeQuestion(item, mergeBriefs(brief, routed.value));
    else if (feedback) return { ok: false, error: routed.error };
  }
  // The student said something is missing and nothing in the note could supply it: say so rather than claim a rewrite.
  if (feedback && !composed) return { ok: false, error: "Nothing in your notes for this problem supplies that. Check the note itself, or ask about it in the chat." };
  const basis = basisOf(question, card.back);
  // Nothing to add means the note's wording already stands on its own: record that, so it is not asked again.
  const full = composed ?? question;
  saveFix(getDb(), ctx.vault.id, card.id, { text: full, condensed: null, basis }, new Date());
  forgetVaultIndex(ctx.vault.id);
  // Only a question that needed additions is sent on for polishing: wording that was already
  // complete costs nothing further.
  if (composed && canStage()) queuePolish(ctx.vault.id, card.id, basis, full);
  return { ok: true, versions: { full, condensed: null, note: question } };
}

/** Has the AI write one problem's question in full and condensed form. `feedback` is what the student says is missing. */
export function writeOutQuestion(ctx: StudyContext, card: Card, feedback: string | null = null): Promise<WriteOutResult> {
  const key = `${ctx.vault.id}:${card.id}`;
  // A specific complaint always gets its own rewrite; a plain write-out joins one already running.
  const running = feedback ? undefined : inFlight.get(key);
  if (running) return running;
  const work = write(ctx, card, feedback).finally(() => {
    if (inFlight.get(key) === work) inFlight.delete(key);
  });
  inFlight.set(key, work);
  return work;
}

/**
 * Goes back to the note's wording and keeps it: the note's own text is recorded as the full
 * version, so the question is not written out again on the next visit or by the bulk writer.
 */
export function discardWording(ctx: StudyContext, card: Card): void {
  const question = noteQuestion(card);
  saveFix(getDb(), ctx.vault.id, card.id, { text: question, condensed: null, basis: basisOf(question, card.back) }, new Date());
  forgetVaultIndex(ctx.vault.id);
}

/** How many questions one round of "write every question out" works through at once. */
const BULK_BATCH = 3;

export interface WriteOutProgress {
  written: number;
  /** Questions still showing the note's wording. */
  remaining: number;
  error?: string;
}

/** Writes out the next few questions still in the notes' wording, unanswerable ones first. */
export async function writeOutNext(ctx: StudyContext): Promise<WriteOutProgress> {
  const pending = ctx.index.cards.filter(needsWritingOut);
  if (pending.length === 0) return { written: 0, remaining: 0 };
  const broken = (card: Card) => Number(questionIssues(card.front, card.back, card.problem!.heading).length > 0);
  const ordered = [...pending].sort((a, b) => broken(b) - broken(a));
  const results = await Promise.all(ordered.slice(0, BULK_BATCH).map((card) => writeOutQuestion(ctx, card)));
  const written = results.filter((r) => r.ok).length;
  const failed = results.find((r): r is { ok: false; error: string } => !r.ok);
  return { written, remaining: pending.length - written, ...(written === 0 && failed ? { error: failed.error } : {}) };
}
