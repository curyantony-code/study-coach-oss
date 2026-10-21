import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, guarded, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { getCheckin, getProfileAnswers, listAttempts } from "@/lib/db/progress";
import { hintFor, hintLevel } from "@/lib/learner/hints";
import { modeResults } from "@/lib/learner/insights";
import { nodeMasteries } from "@/lib/learner/mastery";
import { profileSchema } from "@/lib/learner/profile";
import { buildQueue, DEFAULT_SESSION_SIZE } from "@/lib/learner/queue";
import { getStudyContext, resolveScopeText } from "@/lib/learner/service";
import { bestAskKind, DISTRACTOR_COUNT, parseSessionMode, planKinds } from "@/lib/learner/session";

const MAX_SESSION_SIZE = 50;
const limitSchema = z.coerce.number().int().min(1).max(MAX_SESSION_SIZE).catch(DEFAULT_SESSION_SIZE);

export async function GET(request: NextRequest) {
  return guarded("Loading the study queue", async () => {
    const ctx = await getStudyContext();
    if (!ctx) return fail("Add a vault first.", 404);

    const params = request.nextUrl.searchParams;
    const scope = resolveScopeText(ctx, params.get("scope") ?? "course");
    if (!scope) return fail("That study scope does not exist in this vault.", 404);

    const db = getDb();
    const mode = parseSessionMode(params.get("mode"));
    const sleep = getCheckin(db, ctx.student.id, ctx.today);
    // After a short night, review only: new material sticks badly (docs/ARCHITECTURE.md).
    const reviewOnly = sleep === "poor";
    const items = buildQueue(scope.cards, ctx.states, {
      now: ctx.now,
      limit: limitSchema.parse(params.get("limit") ?? undefined),
      emphasis: scope.emphasis,
      reviewOnly,
    });

    const distractors = [...new Set(scope.cards.filter((c) => c.type !== "problem").map((c) => c.back))];
    const bestKind = bestAskKind(modeResults(listAttempts(db, ctx.student.id, ctx.vault.id)));
    const kinds = planKinds(
      items.map((item) => ({ reason: item.reason, isProblem: item.card.type === "problem" })),
      mode,
      distractors.length > DISTRACTOR_COUNT,
      bestKind
    );
    const masteryByNode = new Map(nodeMasteries(ctx.index, ctx.states, ctx.now).map((n) => [n.nodeId, n.mastery]));
    const nodeTitles = new Map(ctx.index.nodes.map((n) => [n.id, n.title]));
    const nodeSlugs = new Map(ctx.index.nodes.map((n) => [n.id, n.slug]));
    const profile = profileSchema.safeParse(getProfileAnswers(db, ctx.student.id, ctx.vault.id));

    return ok({
      scopeLabel: scope.label,
      scopeSize: scope.cards.length,
      /** True until the student answers today's one-tap sleep question. */
      needsCheckin: sleep === null,
      reviewOnly,
      /** Shown once at the start unless the student already keeps their phone in another room. */
      focusNudge: !(profile.success && profile.data.phone === "away"),
      items: items.map((item, i) => {
        const level = hintLevel(masteryByNode.get(item.card.nodeId) ?? null);
        return {
          id: item.card.id,
          front: item.card.front,
          back: item.card.back,
          nodeTitle: nodeTitles.get(item.card.nodeId) ?? item.card.nodeId,
          /** The Library note this card came from: where "Ask AI" and "Watch a video" look. */
          nodeSlug: nodeSlugs.get(item.card.nodeId) ?? null,
          reason: item.reason,
          kind: kinds[i],
          hint: level === "none" ? null : hintFor(item.card),
          hintLevel: level,
        };
      }),
      // Wrong options for multiple choice come from other answers in the same scope.
      distractors,
    });
  });
}
