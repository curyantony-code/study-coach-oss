import { z } from "zod";
import { fail, guarded, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { saveQuizResult } from "@/lib/db/quiz";
import { getStudyContext } from "@/lib/learner/service";

const resultSchema = z
  .object({
    /** What the quiz was on, as shown to the student; "" for the whole course. */
    topic: z.string().max(300).default(""),
    source: z.enum(["ai", "ready"]),
    score: z.number().int().min(0).max(50),
    total: z.number().int().min(1).max(50),
  })
  .refine((r) => r.score <= r.total);

/** Keeps a finished quiz's score, so it shows on the Progress page. */
export async function POST(request: Request) {
  return guarded("Saving a quiz result", async () => {
    const parsed = resultSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("That quiz result was incomplete.");
    const ctx = await getStudyContext();
    if (!ctx) return fail("Add a vault first.", 404);
    saveQuizResult(getDb(), ctx.student.id, ctx.vault.id, {
      takenAt: ctx.now.toISOString(),
      topic: parsed.data.topic.trim(),
      source: parsed.data.source,
      score: parsed.data.score,
      total: parsed.data.total,
    });
    return ok({ saved: true });
  });
}
