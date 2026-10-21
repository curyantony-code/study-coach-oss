import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, guarded, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { savePaper } from "@/lib/db/progress";
import { buildExam, DEFAULT_EXAM_SIZE } from "@/lib/learner/exam";
import { scopeToString } from "@/lib/learner/scope";
import { getStudyContext, resolveScopeText } from "@/lib/learner/service";

const MAX_EXAM_SIZE = 60;
const countSchema = z.coerce.number().int().min(1).max(MAX_EXAM_SIZE).catch(DEFAULT_EXAM_SIZE);

/**
 * Draws a fresh mock exam for a scope (an assessment, or the whole course). The paper is
 * kept on the server under an id; the browser gets the questions without their answers.
 */
export async function GET(request: NextRequest) {
  return guarded("Building the mock exam", async () => {
    const ctx = await getStudyContext();
    if (!ctx) return fail("Add a vault first.", 404);
    const params = request.nextUrl.searchParams;
    const scope = resolveScopeText(ctx, params.get("scope") ?? "course");
    if (!scope) return fail("That exam does not exist in this vault.", 404);

    const paper = buildExam(scope.cards, ctx.states, { format: scope.assessment?.format ?? [], emphasis: scope.emphasis }, {
      now: ctx.now,
      count: countSchema.parse(params.get("count") ?? undefined),
    });
    const paperId = randomUUID();
    if (paper.questions.length > 0) {
      savePaper(getDb(), ctx.student.id, ctx.vault.id, { id: paperId, scope: scopeToString(scope.scope), questions: paper.questions }, ctx.now);
    }
    const unitLabels = Object.fromEntries(ctx.index.units.map((u) => [u.id, u.label]));
    return ok({ paperId, label: scope.label, ...paper, unitLabels });
  });
}
