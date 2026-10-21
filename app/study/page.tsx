import Link from "next/link";
import { redirect } from "next/navigation";
import MasteryBar from "@/components/study/MasteryBar";
import { studyOptions, type ScopeOption } from "@/lib/learner/overview";
import { scopeToString } from "@/lib/learner/scope";
import { getStudyContext } from "@/lib/learner/service";
import { sessionHref } from "@/lib/learner/session";
import { vaultHealth } from "@/lib/vault/health";

const START = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
const ALT = "text-sm font-semibold text-slate-600 underline underline-offset-2 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded";

function queueText({ counts }: ScopeOption): string {
  const parts = [
    counts.fix > 0 ? `${counts.fix} to fix` : null,
    counts.due > 0 ? `${counts.due} due` : null,
    counts.fresh > 0 ? `${counts.fresh} new` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : counts.total > 0 ? "Nothing due — extra practice available" : "No cards";
}

function ScopeRow({ option }: { option: ScopeOption }) {
  const empty = option.counts.total === 0;
  return (
    <li className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{option.label}</h3>
          <p className="text-sm text-slate-500">
            {[option.detail, `${option.counts.total} cards`, queueText(option)].filter(Boolean).join(" · ")}
          </p>
        </div>
        {!empty && (
          <div className="flex items-center gap-4 shrink-0">
            <Link href={sessionHref(option.scope, "flashcards")} className={ALT}>Flashcards</Link>
            <Link href={sessionHref(option.scope, "quiz")} className={ALT}>Quiz</Link>
            <Link href={sessionHref(option.scope, "smart")} className={START}>Study</Link>
          </div>
        )}
      </div>
      <div className="mt-3">
        <MasteryBar mastery={option.mastery} label={option.label} />
      </div>
    </li>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-10">
      <h2 id={id} className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{title}</h2>
      {hint && <p className="text-sm text-slate-500 mt-1">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function StudyPage() {
  const ctx = await getStudyContext();
  if (!ctx) redirect("/vaults");
  const options = studyOptions(ctx);
  const { recommended } = options;
  const { cardsByNode } = vaultHealth(ctx.index);
  const notes = ctx.index.nodes.filter((n) => cardsByNode.has(n.id)).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <h1 className="text-3xl font-extrabold gradient-text mb-1">Study</h1>
      <p className="text-slate-500 text-sm mb-8">Pick what to study. Every mode asks you to answer before you see the answer.</p>

      <section aria-labelledby="recommended" className="mb-10 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-6 sm:p-8 shadow-lg">
        <p id="recommended" className="text-xs font-semibold uppercase tracking-widest text-blue-100">Recommended now</p>
        <h2 className="text-2xl sm:text-3xl font-extrabold mt-1">{recommended.label}</h2>
        <p className="text-blue-100 mt-1">{[recommended.detail, queueText(recommended)].filter(Boolean).join(" · ")}</p>
        {recommended.counts.total > 0 ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link href={sessionHref(recommended.scope, "smart")} className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700 focus-visible:ring-white">
              Start a smart session
            </Link>
            <Link href={sessionHref(recommended.scope, "smart", 20)} className="text-sm font-semibold text-white underline underline-offset-2 hover:text-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded">
              Longer session (20 cards)
            </Link>
          </div>
        ) : (
          <p className="mt-4 text-sm text-blue-50">No cards could be made from this vault yet. Open the vault’s health check to see why.</p>
        )}
      </section>

      {options.assessments.length > 0 && (
        <Section id="by-assessment" title="By assessment" hint="Everything a test covers, mixed across its units.">
          <ul className="space-y-3">{options.assessments.map((o) => <ScopeRow key={o.scope} option={o} />)}</ul>
        </Section>
      )}

      {options.units.length > 0 && (
        <Section id="by-unit" title="By unit">
          <ul className="space-y-3">{options.units.map((o) => <ScopeRow key={o.scope} option={o} />)}</ul>
        </Section>
      )}

      <Section id="more" title="More ways in">
        <ul className="space-y-3">
          {options.weakest && <ScopeRow option={options.weakest} />}
          <ScopeRow option={options.course} />
        </ul>
      </Section>

      {notes.length > 0 && (
        <Section id="by-note" title="By note" hint="One note, or the note plus everything it links to.">
          <details className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <summary className="cursor-pointer select-none px-4 py-3 font-semibold text-slate-800 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              Choose from {notes.length} notes
            </summary>
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {notes.map((node) => (
                <li key={node.id} className="flex items-center justify-between gap-3 px-4 py-2.5 flex-wrap">
                  <span className="text-sm text-slate-800 min-w-0">
                    {node.title} <span className="text-slate-400 tabular-nums">· {cardsByNode.get(node.id)} cards</span>
                  </span>
                  <span className="flex items-center gap-4 shrink-0">
                    <Link href={sessionHref(scopeToString({ kind: "node", id: node.id, neighbours: true }))} className={ALT}>With linked notes</Link>
                    <Link href={sessionHref(scopeToString({ kind: "node", id: node.id, neighbours: false }))} className={ALT}>Just this note</Link>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </Section>
      )}
    </div>
  );
}
