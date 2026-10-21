import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, guarded, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { getActiveContent } from "@/lib/vault/active";
import { findVideos, youtubeFromEnv } from "@/lib/videos/service";
import { topicForCard } from "@/lib/videos/topic";
import { VideoSearchError } from "@/lib/videos/youtube";

const querySchema = z.object({
  /** A Library note… */
  slug: z.string().min(1).max(600).optional(),
  section: z.string().max(300).default(""),
  /** …or a study card, searched by its own topic. */
  cardId: z.string().min(1).max(100).optional(),
  variant: z.coerce.number().int().min(0).max(10).catch(0),
});

export async function GET(request: NextRequest) {
  return guarded("Finding videos", async () => {
    const params = request.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      slug: params.get("slug") ?? undefined,
      section: params.get("section") ?? "",
      cardId: params.get("cardId") ?? undefined,
      variant: params.get("variant") ?? 0,
    });
    if (!parsed.success || (!parsed.data.slug && !parsed.data.cardId)) return fail("That request was incomplete.");

    const active = await getActiveContent();
    const card = parsed.data.cardId ? active?.index.cards.find((c) => c.id === parsed.data.cardId) : undefined;
    if (parsed.data.cardId && !card) return fail("That card is not in the vault you are studying.", 404);
    const node = active?.index.nodes.find((n) => (card ? n.id === card.nodeId : n.slug === parsed.data.slug));
    if (!node) return fail("That note is not in the vault you are studying.", 404);
    // A problem card's question may be the textbook's wording: search by what the note calls it.
    const topic = card ? topicForCard(node, { ...card, front: card.problem?.original?.noteVersion ?? card.front }) : undefined;

    try {
      const results = await findVideos({ node, section: parsed.data.section, variant: parsed.data.variant, topic }, { db: getDb(), youtube: youtubeFromEnv() });
      return results ? ok(results) : fail("That section is not in this note.", 404);
    } catch (error) {
      if (error instanceof VideoSearchError) return fail(error.message, 502);
      throw error;
    }
  });
}
