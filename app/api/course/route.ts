import { fail, guarded, ok } from "@/lib/api";
import { courseBrief, quizTopics } from "@/lib/course";
import { coverageFor, type ExamPart } from "@/lib/exam-parts";
import { getSchedule } from "@/lib/schedule/store";
import { getActiveContent } from "@/lib/vault/active";

/** The active course's name, units, topics and exam coverage, for the practice tools' pickers. */
export async function GET() {
  return guarded("Loading the course", async () => {
    const active = await getActiveContent();
    if (!active) return fail("Add a vault first.", 404);
    const { index } = active;
    const entries = getSchedule(active.vault.id)?.entries ?? null;
    const part = (name: ExamPart) => {
      const coverage = coverageFor(name, index, entries);
      const covered = new Set(coverage.nodeIds);
      const cards = index.cards.filter((c) => covered.has(c.nodeId));
      return { basis: coverage.basis, notes: coverage.nodeIds.length, cards: cards.length, examples: cards.filter((c) => c.type === "problem").length };
    };
    return ok({ vaultId: active.vault.id, ...courseBrief(index), topics: quizTopics(index), parts: { midterm: part("midterm"), final: part("final") } });
  });
}
