import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import MathText from "@/components/MathText";
import ProblemViewer from "@/components/problems/ProblemViewer";
import { getStudyContext } from "@/lib/learner/service";
import { explainProvider, PROVIDER_LABEL } from "@/lib/ai/explain";
import { getDb } from "@/lib/db/client";
import { getQuestionStyle } from "@/lib/problems/fixes";
import { questionIssues } from "@/lib/questions/rules";
import { getProblemsView } from "@/lib/problems/service";
import { libraryHref } from "@/lib/vault/render";

const NAV = "rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export default async function ProblemPage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const ctx = await getStudyContext();
  if (!ctx) redirect("/vaults");
  const { set, status } = getProblemsView(ctx);
  const position = set.order.findIndex((p) => p.card.id === cardId);
  if (position === -1) notFound();

  const { card, parsed, nodeTitle } = set.order[position];
  const previous = set.order[position - 1];
  const next = set.order[position + 1];
  const section = set.sections.find((s) => s.entries.some((e) => e.problem?.card.id === card.id));
  const labels = section?.entries.filter((e) => e.problem?.card.id === card.id).map((e) => e.label) ?? [];
  const node = ctx.index.nodes.find((n) => n.id === card.nodeId);
  const textbook = Boolean(card.problem!.original) && !card.problem!.original!.completed;
  const noteWording = card.problem!.versions?.note ?? card.front;

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-4 flex-wrap">
        <Link href="/problems" className="hover:text-slate-800 underline-offset-2 hover:underline">Problems</Link>
        <span aria-hidden="true">/</span>
        {section && <Link href={`/problems#${section.id}`} className="hover:text-slate-800 underline-offset-2 hover:underline">{section.title}</Link>}
        <span className="ml-auto tabular-nums">{position + 1} of {set.order.length}</span>
      </nav>

      <article className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-1">
          {section?.title}{labels.length > 0 && section?.id.startsWith("ch") ? ` · ${labels.join(", ")}` : ""}
        </p>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-1"><MathText text={parsed?.title || card.problem!.heading} /></h1>
        {card.problem!.note && <p className="text-sm text-slate-500 mb-1">{card.problem!.note}</p>}
        <p className="text-sm text-slate-500 mb-6">
          From {node ? <Link href={libraryHref(node.slug)} className="underline underline-offset-2 hover:text-blue-700">{nodeTitle}</Link> : nodeTitle}
        </p>
        <ProblemViewer
          key={card.id}
          cardId={card.id}
          statement={card.front}
          formula={card.problem!.formula}
          solution={card.back}
          lastResult={status.get(card.id) ?? "new"}
          nextHref={next ? `/problems/${next.card.id}` : null}
          original={card.problem!.original ?? null}
          issues={textbook ? [] : questionIssues(noteWording, card.back, card.problem!.heading).map((issue) => issue.message)}
          style={getQuestionStyle(getDb())}
          versions={card.problem!.versions ?? null}
          providerLabel={PROVIDER_LABEL[explainProvider()]}
        />
      </article>

      <div className="flex items-center justify-between gap-3 mt-5">
        {previous ? <Link href={`/problems/${previous.card.id}`} className={NAV}>← Previous</Link> : <span />}
        <Link href={section ? `/problems#${section.id}` : "/problems"} className="text-sm font-semibold text-slate-600 underline underline-offset-2 hover:text-blue-700">All problems</Link>
        {next ? <Link href={`/problems/${next.card.id}`} className={NAV}>Next →</Link> : <span />}
      </div>
    </div>
  );
}
