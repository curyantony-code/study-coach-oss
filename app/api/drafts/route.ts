import { z } from "zod";
import { completeText } from "@/lib/ai/complete";
import { draftSystemPrompt, draftUserPrompt, formatDraftFile, parseDrafts } from "@/lib/ai/drafts";
import { fail, guarded, ok } from "@/lib/api";
import { getActiveContent } from "@/lib/vault/active";
import { localToday } from "@/lib/vault/health";

const bodySchema = z.object({ slug: z.string().min(1).max(600) });

/** Asks the AI to draft study cards for a note. Nothing is written: the owner reviews the draft first. */
export async function POST(request: Request) {
  return guarded("Drafting cards", async () => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("That request was incomplete.");
    const active = await getActiveContent();
    const node = active?.index.nodes.find((n) => n.slug === parsed.data.slug);
    if (!active || !node) return fail("That note is not in the vault you are studying.", 404);

    const reply = await completeText(draftSystemPrompt(active.index.course.name), draftUserPrompt(node));
    if (!reply.ok) return fail(reply.error, 502);
    const cards = parseDrafts(reply.text);
    if (cards.length === 0) return fail("The AI did not return any usable cards. Try again.", 502);
    return ok({ count: cards.length, file: formatDraftFile(node.title, cards, localToday()) });
  });
}
