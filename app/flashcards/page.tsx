import { redirect } from "next/navigation";
import { defaultScope, scopeToString } from "@/lib/learner/scope";
import { getStudyContext } from "@/lib/learner/service";
import { sessionHref } from "@/lib/learner/session";

/** The old flip-through deck is now a scored session; this keeps old links working. */
export default async function FlashcardsPage() {
  const ctx = await getStudyContext();
  if (!ctx) redirect("/vaults");
  redirect(sessionHref(scopeToString(defaultScope(ctx.index, ctx.today)), "flashcards"));
}
