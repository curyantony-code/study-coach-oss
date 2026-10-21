import { z } from "zod";
import { completeText } from "@/lib/ai/complete";
import { fail, guarded, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { saveExplanation } from "@/lib/db/progress";
import { getStudyContext } from "@/lib/learner/service";
import { gradeSystemPrompt, gradeUserPrompt, keyPoints, MAX_EXPLANATION_LENGTH, MIN_EXPLANATION_LENGTH, parseGrade, SELF_RATINGS } from "@/lib/learner/teachback";

const bodySchema = z.object({
  nodeId: z.string().min(1).max(600),
  text: z.string().trim().min(MIN_EXPLANATION_LENGTH).max(MAX_EXPLANATION_LENGTH),
  /** Set when the student rates themselves because no AI grade was available. */
  selfRating: z.enum(SELF_RATINGS.map((r) => r.id) as [string, ...string[]]).optional(),
});

/**
 * Grades a from-memory explanation of a note. The AI compares it with the note; if no AI
 * answers (or its reply is not usable), the response says so and carries the note's key
 * points, and the student rates themselves in a second call.
 */
export async function POST(request: Request) {
  return guarded("Grading the explanation", async () => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail(`Write at least a few sentences (${MIN_EXPLANATION_LENGTH} characters or more) before checking.`);
    const ctx = await getStudyContext();
    const node = ctx?.index.nodes.find((n) => n.id === parsed.data.nodeId);
    if (!ctx || !node) return fail("That note is not in the vault you are studying.", 404);

    const { text, selfRating } = parsed.data;
    const save = (score: number, covered: string[], missing: string[], tip: string, selfRated: boolean) =>
      saveExplanation(getDb(), ctx.student.id, ctx.vault.id, { nodePath: node.id, text, score, covered, missing, tip, selfRated, createdAt: ctx.now.toISOString() });

    if (selfRating) {
      const rating = SELF_RATINGS.find((r) => r.id === selfRating)!;
      save(rating.score, [], [], "", true);
      return ok({ graded: true as const, selfRated: true, score: rating.score, covered: [], missing: [], tip: "" });
    }

    const reply = await completeText(gradeSystemPrompt(ctx.index.course.name), gradeUserPrompt(node, text));
    const grade = reply.ok ? parseGrade(reply.text) : null;
    if (!grade) {
      // Never invent a grade: hand the student the key points to check themselves against.
      return ok({ graded: false as const, reason: reply.ok ? "The AI's answer could not be read as a grade." : reply.error, keyPoints: keyPoints(node.id, ctx.index.cards) });
    }
    save(grade.score, grade.covered, grade.missing, grade.tip, false);
    return ok({ graded: true as const, selfRated: false, ...grade });
  });
}
