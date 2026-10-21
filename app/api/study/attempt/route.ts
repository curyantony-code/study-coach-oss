import { z } from "zod";
import { fail, guarded, ok } from "@/lib/api";
import { getStudyContext, recordAnswer } from "@/lib/learner/service";
import { CONFIDENCE_LEVELS, STUDY_MODES } from "@/lib/learner/types";

const attemptSchema = z.object({
  cardId: z.string().min(1).max(64),
  scope: z.string().min(1).max(600),
  mode: z.enum(STUDY_MODES),
  correct: z.boolean(),
  confidence: z.enum(CONFIDENCE_LEVELS).nullable().default(null),
  responseMs: z.number().int().min(0).max(3_600_000).nullable().default(null),
  guessedFirst: z.boolean().optional(),
  hintUsed: z.boolean().optional(),
  distracted: z.boolean().optional(),
});

export async function POST(request: Request) {
  return guarded("Saving an answer", async () => {
    const body = await request.json().catch(() => null);
    const parsed = attemptSchema.safeParse(body);
    if (!parsed.success) return fail("That answer could not be saved because it was incomplete.");

    const ctx = await getStudyContext();
    if (!ctx) return fail("Add a vault first.", 404);

    const result = recordAnswer(ctx, parsed.data);
    if (!result.ok) return fail(result.error, 404);
    return ok({ due: result.state.fsrs?.due ?? null, needsFix: result.state.needsFix });
  });
}
