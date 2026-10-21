import { z } from "zod";
import { fail, guarded, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { claimPaperRecording, getPaper } from "@/lib/db/progress";
import { markExam, type ExamQuestion } from "@/lib/learner/exam";
import { getStudyContext, recordAnswers } from "@/lib/learner/service";

const bodySchema = z.object({
  paperId: z.string().uuid(),
  answers: z.array(z.object({ cardId: z.string().min(1).max(64), response: z.string().max(20_000), selfMark: z.boolean().nullable() })).max(60),
  /** True on the final submit, once written answers have been self-marked: the result is saved to progress. */
  record: z.boolean().default(false),
});

/**
 * Marks a mock exam. The questions come from the paper the server issued, not from the
 * browser, so the only thing taken on trust is the student's own mark for a written answer.
 * A paper is saved to progress at most once, all questions together.
 */
export async function POST(request: Request) {
  return guarded("Marking the mock exam", async () => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("That exam could not be marked because it was incomplete.");
    const ctx = await getStudyContext();
    if (!ctx) return fail("Add a vault first.", 404);

    const db = getDb();
    const paper = getPaper<ExamQuestion>(db, ctx.student.id, ctx.vault.id, parsed.data.paperId);
    if (!paper) return fail("That exam was not found. Start a new one.", 404);

    const result = markExam(paper.questions, parsed.data.answers, ctx.index.cards);
    if (!parsed.data.record) return ok({ ...result, recorded: false });
    if (result.unmarked > 0) return fail("Mark your written answers first.");

    // Pressing Save twice, or retrying after an error, must not count the exam twice.
    recordAnswers(
      ctx,
      result.marked.map((q) => ({ cardId: q.cardId, scope: paper.scope, mode: "mock-exam" as const, correct: q.correct === true, confidence: null, responseMs: null })),
      () => claimPaperRecording(db, paper.id, ctx.now)
    );
    return ok({ ...result, recorded: true });
  });
}
