import { fail, guarded, ok } from "@/lib/api";
import { getStudyContext } from "@/lib/learner/service";
import { writeOutNext } from "@/lib/problems/complete-service";

/** Writes out the next few questions that are still in the notes' wording. Called repeatedly by the Problems page. */
export async function POST() {
  return guarded("Writing questions out", async () => {
    const ctx = await getStudyContext();
    if (!ctx) return fail("Add a vault first.", 404);
    return ok(await writeOutNext(ctx));
  });
}
