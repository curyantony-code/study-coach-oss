import { fail, guarded, ok } from "@/lib/api";
import { legacyProgressSchema } from "@/lib/learner/legacy";
import { getStudyContext, importLegacyProgress } from "@/lib/learner/service";

export async function POST(request: Request) {
  return guarded("Importing old progress", async () => {
    const parsed = legacyProgressSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("The old progress was not in a format that can be imported.");

    const ctx = await getStudyContext();
    if (!ctx) return fail("Add a vault first.", 404);
    return ok({ imported: importLegacyProgress(ctx, parsed.data) });
  });
}
