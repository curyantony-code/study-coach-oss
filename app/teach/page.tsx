import Link from "next/link";
import { redirect } from "next/navigation";
import TeachBack from "@/components/teach/TeachBack";
import { explainProvider, PROVIDER_LABEL } from "@/lib/ai/explain";
import { isReferenceNote } from "@/lib/course";
import { getDb } from "@/lib/db/client";
import { latestExplanations } from "@/lib/db/progress";
import { nodeMasteries } from "@/lib/learner/mastery";
import { scopeToString } from "@/lib/learner/scope";
import { getStudyContext } from "@/lib/learner/service";
import { sessionHref } from "@/lib/learner/session";
import { scoreBand } from "@/lib/learner/teachback";
import { libraryHref } from "@/lib/vault/render";

const BAND = { strong: "bg-emerald-100 text-emerald-800", middling: "bg-amber-100 text-amber-800", weak: "bg-rose-100 text-rose-800" } as const;

function teachHref(nodeId: string): string {
  return `/teach?${new URLSearchParams({ node: nodeId })}`;
}

export default async function TeachPage({ searchParams }: { searchParams: Promise<{ node?: string }> }) {
  const params = await searchParams;
  const ctx = await getStudyContext();
  if (!ctx) redirect("/vaults");
  const { index } = ctx;
  const past = new Map(latestExplanations(getDb(), ctx.student.id, ctx.vault.id).map((e) => [e.nodePath, e]));
  const node = params.node ? index.nodes.find((n) => n.id === params.node) : undefined;

  if (node) {
    const last = past.get(node.id);
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500 mb-4">
          <Link href="/teach" className="hover:text-slate-800 underline-offset-2 hover:underline">Teach back</Link>
        </nav>
        <h1 className="text-3xl font-extrabold gradient-text mb-1">Teach it back</h1>
        <p className="text-slate-500 text-sm mb-6">
          Explaining from memory shows what you really know. Your explanation and the note are sent to {PROVIDER_LABEL[explainProvider()]} to be compared.
          {last?.score != null ? ` Last time on this note: ${last.score}/100.` : ""}
        </p>
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <TeachBack
            key={node.id}
            nodeId={node.id}
            noteTitle={node.title}
            studyHref={sessionHref(scopeToString({ kind: "node", id: node.id, neighbours: false }))}
            noteHref={libraryHref(node.slug)}
          />
        </section>
      </div>
    );
  }

  // Notes with something to explain, weakest first. Topics come before reference sheets
  // (formula sheets, glossaries, the index): a topic is what there is to teach.
  const masteries = new Map(nodeMasteries(index, ctx.states, ctx.now).map((m) => [m.nodeId, m]));
  const notes = index.nodes
    .filter((n) => (masteries.get(n.id)?.cardCount ?? 0) > 0)
    .sort((a, b) => Number(isReferenceNote(a.id)) - Number(isReferenceNote(b.id)) || (masteries.get(a.id)?.mastery ?? 0) - (masteries.get(b.id)?.mastery ?? 0) || a.title.localeCompare(b.title, undefined, { numeric: true }));

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <h1 className="text-3xl font-extrabold gradient-text mb-1">Teach back</h1>
      <p className="text-slate-500 text-sm mb-8">
        Pick a note and explain it from memory, as if teaching someone. You will be told what you covered and what you missed. Weakest notes are listed first.
      </p>
      {notes.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">This vault has no notes with cards to explain yet.</p>
      ) : (
        <ul className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {notes.map((n) => {
            const last = past.get(n.id);
            return (
              <li key={n.id}>
                <Link href={teachHref(n.id)} className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-blue-50 active:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
                  <span className="text-sm font-medium text-slate-800 min-w-0">{n.title}</span>
                  {last?.score != null ? (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 tabular-nums ${BAND[scoreBand(last.score)]}`}>Last: {last.score}/100</span>
                  ) : (
                    <span className="text-xs text-slate-500 shrink-0">Not tried</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
