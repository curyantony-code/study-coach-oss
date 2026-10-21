import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, fromThisApp, guarded, ok } from "@/lib/api";
import { writeNextCards } from "@/lib/build/cards-service";

const bodySchema = z.object({ vaultId: z.string().uuid(), again: z.boolean().default(false), skip: z.array(z.string().max(1000)).max(2000).default([]) });

/** Writes study cards into the next note of a course that was built here. One note per call. */
export function POST(request: Request) {
  return guarded("Writing study cards", async () => {
    if (!fromThisApp(request)) return fail("That request did not come from Study Coach.", 403);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Choose a course first.");
    const step = await writeNextCards(parsed.data.vaultId, parsed.data.again, parsed.data.skip);
    if (!step.ok) return fail(step.error, 409);
    if (step.added > 0) revalidatePath("/", "layout");
    return ok(step);
  });
}
