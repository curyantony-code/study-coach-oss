import { z } from "zod";
import { fail, guarded, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { QUESTION_STYLES, setQuestionStyle } from "@/lib/problems/fixes";
import { forgetAllVaultIndexes } from "@/lib/vault/store";

const bodySchema = z.object({ style: z.enum(QUESTION_STYLES) });

/** Remembers which wording of questions to show everywhere: in full, condensed, or as in the notes. */
export async function POST(request: Request) {
  return guarded("Saving the wording choice", async () => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Choose in full, condensed or notes.");
    setQuestionStyle(getDb(), parsed.data.style);
    forgetAllVaultIndexes();
    return ok({ style: parsed.data.style });
  });
}
