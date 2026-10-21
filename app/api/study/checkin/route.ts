import { z } from "zod";
import { fail, guarded, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { saveCheckin } from "@/lib/db/progress";
import { getStudyContext } from "@/lib/learner/service";

const bodySchema = z.object({ sleep: z.enum(["good", "ok", "poor"]) });

/** One-tap "how did you sleep?" for today. A short night switches sessions to review only. */
export async function POST(request: Request) {
  return guarded("Saving the sleep check-in", async () => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Choose one of the three answers.");
    const ctx = await getStudyContext();
    if (!ctx) return fail("Add a vault first.", 404);
    saveCheckin(getDb(), ctx.student.id, ctx.today, parsed.data.sleep);
    return ok({ sleep: parsed.data.sleep });
  });
}
