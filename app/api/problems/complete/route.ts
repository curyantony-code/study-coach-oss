import { z } from "zod";
import { fail, guarded, ok } from "@/lib/api";
import { MAX_FEEDBACK } from "@/lib/ai/complete-question";
import { getStudyContext } from "@/lib/learner/service";
import { discardWording, hasTextbookWording, writeOutQuestion } from "@/lib/problems/complete-service";

const bodySchema = z.object({
  cardId: z.string().min(1).max(64),
  intent: z.enum(["complete", "report", "revert"]).default("complete"),
  feedback: z.string().max(MAX_FEEDBACK).default(""),
});

/**
 * Writes one problem's question out (in full and condensed), rewrites it from the student's
 * note about what is missing, or discards the AI wording. Nothing in the vault changes.
 */
export async function POST(request: Request) {
  return guarded("Writing the question out", async () => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("That request was incomplete.");
    const ctx = await getStudyContext();
    if (!ctx) return fail("Add a vault first.", 404);
    const card = ctx.index.cards.find((c) => c.id === parsed.data.cardId);
    if (!card || card.type !== "problem" || !card.problem) return fail("That problem is not in this vault.", 404);
    if (hasTextbookWording(card)) return fail("This problem already shows the textbook's full wording.");

    if (parsed.data.intent === "revert") {
      discardWording(ctx, card);
      return ok({ versions: null });
    }
    const feedback = parsed.data.intent === "report" ? parsed.data.feedback.trim() : "";
    if (parsed.data.intent === "report" && feedback.length < 3) return fail("Say in a few words what is missing or wrong.");
    const result = await writeOutQuestion(ctx, card, feedback || null);
    if (!result.ok) return fail(`${result.error} Try again in a moment.`, 502);
    return ok({ versions: result.versions });
  });
}
