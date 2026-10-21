import Link from "next/link";
import { redirect } from "next/navigation";
import ExamRunner from "@/components/exam/ExamRunner";
import { DEFAULT_EXAM_SIZE } from "@/lib/learner/exam";
import { dateDetail } from "@/lib/learner/overview";
import { assessmentCards } from "@/lib/learner/mastery";
import { getStudyContext } from "@/lib/learner/service";

const MAX_COUNT = 60;
const START = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
const ALT = "text-sm font-semibold text-slate-600 underline underline-offset-2 hover:text-blue-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

function examHref(scope: string, count = DEFAULT_EXAM_SIZE): string {
  return `/exam?${new URLSearchParams({ scope, count: String(count) })}`;
}

export default async function ExamPage({ searchParams }: { searchParams: Promise<{ scope?: string; count?: string }> }) {
  const params = await searchParams;
  const ctx = await getStudyContext();
  if (!ctx) redirect("/vaults");

  if (params.scope) {
    const requested = Number.parseInt(params.count ?? "", 10);
    const count = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_COUNT) : DEFAULT_EXAM_SIZE;
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-baseline justify-between gap-3 mb-6">
          <h1 className="text-3xl font-extrabold gradient-text">Mock exam</h1>
          <Link href="/exam" className={ALT}>Choose another</Link>
        </div>
        <ExamRunner key={`${params.scope}|${count}`} scope={params.scope} count={count} />
      </div>
    );
  }

  const { index } = ctx;
  const options = [
    ...index.assessments.map((a) => ({
      scope: `assessment:${a.id}`,
      label: a.label,
      detail: [dateDetail(a.date, ctx.now), a.format.length > 0 ? a.format.join(", ") : null].filter(Boolean).join(" · "),
      cards: assessmentCards(index, a).length,
    })),
    { scope: "course", label: "Whole course", detail: "Everything, in a mix of multiple choice and written questions", cards: index.cards.length },
  ];

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <h1 className="text-3xl font-extrabold gradient-text mb-1">Mock exam</h1>
      <p className="text-slate-500 text-sm mb-8">A timed paper in the assessment’s own format, mixed across units, with no feedback until the end.</p>
      <section aria-labelledby="ai-exam" className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 id="ai-exam" className="font-semibold text-slate-900">AI mock exam: Midterm or Final</h2>
          <p className="text-sm text-slate-600">New questions modelled on your worked examples, with the numbers changed. Choose Midterm or Final on the next screen.</p>
        </div>
        <Link href="/exam/ai" className={START}>Set up an AI exam</Link>
      </section>
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-3">From your own cards</h2>
      <ul className="space-y-3">
        {options.map((option) => (
          <li key={option.scope} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h2 className="font-semibold text-slate-900">{option.label}</h2>
              <p className="text-sm text-slate-500">{option.detail} · {option.cards} cards to draw from</p>
            </div>
            {option.cards > 0 ? (
              <div className="flex items-center gap-4 shrink-0">
                <Link href={examHref(option.scope, 10)} className={ALT}>Short (10)</Link>
                <Link href={examHref(option.scope)} className={START}>Start ({Math.min(DEFAULT_EXAM_SIZE, option.cards)} questions)</Link>
              </div>
            ) : (
              <span className="text-sm text-slate-500">No cards yet</span>
            )}
          </li>
        ))}
      </ul>
      {index.assessments.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          Add your tests in <Link href={`/vaults/${ctx.vault.id}#manifest`} className="font-semibold text-blue-700 underline underline-offset-2">study.yml</Link> to get an exam in each one’s format.
        </p>
      )}
    </div>
  );
}
