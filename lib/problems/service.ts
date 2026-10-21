// Server-side glue for the Problems pages.
import { getDb } from "../db/client";
import { listAttempts } from "../db/progress";
import type { StudyContext } from "../learner/service";
import { getSetting, setSetting } from "../vault/registry";
import { buildProblemSet, findProblems, latestResults, parseOutline, type ProblemSet, type ProblemStatus } from "./outline";

const outlineKey = (vaultId: string) => `outline:${vaultId}`;

/** The outline text the student pasted for this vault, kept in the app's database (never in the vault). */
export function getOutlineText(vaultId: string): string {
  return getSetting(getDb(), outlineKey(vaultId)) ?? "";
}

export function saveOutlineText(vaultId: string, text: string): void {
  setSetting(getDb(), outlineKey(vaultId), text);
}

export interface ProblemsView {
  set: ProblemSet;
  outlineText: string;
  status: Map<string, ProblemStatus>;
}

export function getProblemsView(ctx: StudyContext): ProblemsView {
  const outlineText = getOutlineText(ctx.vault.id);
  const outline = parseOutline(outlineText);
  return {
    set: buildProblemSet(findProblems(ctx.index.cards, ctx.index.nodes), outline.length > 0 ? outline : null),
    outlineText,
    status: latestResults(listAttempts(getDb(), ctx.student.id, ctx.vault.id)),
  };
}
