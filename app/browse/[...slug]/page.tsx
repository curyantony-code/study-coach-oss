import AskAboutSelection from "@/components/library/AskAboutSelection";
import DraftCards from "@/components/library/DraftCards";
import TopicVideos from "@/components/library/TopicVideos";
import { getActiveContent } from "@/lib/vault/active";
import { pageSections, shortTitle } from "@/lib/vault/render";
import { topicsOf } from "@/lib/videos/topic";
import { explainProvider, PROVIDER_LABEL } from "@/lib/ai/explain";
import { getPage } from "@/lib/wiki";
import Link from "next/link";
import { notFound } from "next/navigation";

const TYPE_STYLES: Record<string, string> = {
  source:   "bg-blue-100 text-blue-700 border-blue-200",
  concept:  "bg-violet-100 text-violet-700 border-violet-200",
  entity:   "bg-emerald-100 text-emerald-700 border-emerald-200",
  overview: "bg-slate-100 text-slate-600 border-slate-200",
};

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export default async function WikiPageRoute({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = await getPage(slug.map(decodeSegment).join("/"));
  if (!page) notFound();
  const active = await getActiveContent();
  const node = active?.index.nodes.find((n) => n.slug === page.slug);
  const unitLabels = (node?.unitIds ?? []).map((id) => active?.index.units.find((u) => u.id === id)?.label ?? id);
  const sections = pageSections(page.html);
  const problemCount = active && node ? active.index.cards.filter((c) => c.nodeId === node.id && c.type === "problem").length : 0;

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-6">
        <Link href="/browse" className="hover:text-slate-600 transition-colors">Library</Link>
        <span>/</span>
        <span className="text-slate-600 font-medium truncate">{shortTitle(page.title)}</span>
      </div>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <h1 className="text-2xl font-extrabold text-slate-900">{shortTitle(page.title)}</h1>
          <span className={`text-sm px-3 py-1 rounded-full font-medium border ${TYPE_STYLES[page.type] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
            {page.type}
          </span>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-slate-500 mb-3">
          {page.updated && <span>Updated {page.updated}</span>}
          {unitLabels.length > 0 && <span>{unitLabels.join(" · ")}</span>}
        </div>
        {page.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {page.tags.map((t) => (
              <span key={t} className="text-xs bg-slate-50 border border-slate-200 text-slate-500 px-2.5 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        )}
      </div>

      {sections.length > 2 && (
        <nav aria-label="On this page" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">On this page</h2>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-slate-700 underline-offset-2 hover:text-blue-700 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
          {problemCount > 0 && (
            <p className="mt-4 text-sm text-slate-500">
              {problemCount} worked problems in this note. Solutions are folded away: try each one, then open it.{" "}
              <Link href="/problems" className="font-semibold text-blue-700 underline underline-offset-2">Work through them by chapter</Link>
            </p>
          )}
        </nav>
      )}

      <TopicVideos slug={page.slug} topics={topicsOf({ title: page.title, body: page.rawContent }).map(({ section, name }) => ({ section, name }))} />

      {/* Content */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-10">
        <AskAboutSelection slug={page.slug} providerLabel={PROVIDER_LABEL[explainProvider()]}>
        <article
          className="note-prose prose prose-slate max-w-none prose-headings:font-bold prose-a:text-indigo-600 hover:prose-a:text-indigo-800 prose-blockquote:border-l-4 prose-blockquote:border-indigo-400 prose-blockquote:bg-indigo-50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r prose-code:bg-slate-100 prose-code:px-1 prose-code:rounded"
          dangerouslySetInnerHTML={{ __html: page.html }}
        />
        </AskAboutSelection>
        <p className="mt-6 text-xs text-slate-500">Tip: highlight any text or formula in this note to ask the AI about it.</p>
      </div>

      {active && node && (
        <DraftCards
          slug={page.slug}
          cardCount={active.index.cards.filter((c) => c.nodeId === node.id).length}
          writeEnabled={active.vault.writeEnabled}
          vaultHref={`/vaults/${active.vault.id}#manifest`}
          providerLabel={PROVIDER_LABEL[explainProvider()]}
        />
      )}
    </div>
  );
}
