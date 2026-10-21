import Link from "next/link";
import { redirect } from "next/navigation";
import LegacyImport from "@/components/study/LegacyImport";
import { getDb } from "@/lib/db/client";
import { getProfileAnswers } from "@/lib/db/progress";
import { readinessLines, studyOptions } from "@/lib/learner/overview";
import { getStudyContext } from "@/lib/learner/service";
import { sessionHref } from "@/lib/learner/session";
import { nextAssessment, vaultHealth } from "@/lib/vault/health";

const STUDY_MODES = [
  {
    href: "/flashcards",
    icon: "🃏",
    title: "Flashcards",
    desc: "Rate your confidence, recall, then check.",
    color: "from-blue-500 to-cyan-500",
    bg: "bg-blue-50 border-blue-100",
  },
  {
    href: "/learn",
    icon: "🧠",
    title: "Learn",
    desc: "Adaptive mode — missed cards loop back until mastered.",
    color: "from-violet-500 to-indigo-500",
    bg: "bg-violet-50 border-violet-100",
  },
  {
    href: "/write",
    icon: "✍️",
    title: "Write",
    desc: "Type the answer. Fuzzy matching scores partial credit.",
    color: "from-emerald-500 to-teal-500",
    bg: "bg-emerald-50 border-emerald-100",
  },
  {
    href: "/match",
    icon: "🎯",
    title: "Match Game",
    desc: "Race the clock matching terms to definitions.",
    color: "from-orange-500 to-amber-500",
    bg: "bg-orange-50 border-orange-100",
  },
  {
    href: "/quiz",
    icon: "📝",
    title: "Quiz",
    desc: "AI-written questions. Not counted in progress yet.",
    color: "from-rose-500 to-pink-500",
    bg: "bg-rose-50 border-rose-100",
  },
  {
    href: "/notes",
    icon: "📄",
    title: "Notes",
    desc: "AI-generated study notes at three detail levels.",
    color: "from-sky-500 to-blue-500",
    bg: "bg-sky-50 border-sky-100",
  },
  {
    href: "/arcade",
    icon: "🕹️",
    title: "Arcade",
    desc: "Dodge obstacles, answer flashcard questions to score.",
    color: "from-purple-500 to-fuchsia-500",
    bg: "bg-purple-50 border-purple-100",
  },
  {
    href: "/chat",
    icon: "💬",
    title: "AI Tutor",
    desc: "Ask anything. The AI answers from your notes.",
    color: "from-slate-500 to-slate-700",
    bg: "bg-slate-50 border-slate-200",
  },
];

export default async function HomePage() {
  const ctx = await getStudyContext();
  if (!ctx) redirect("/vaults");
  const { vault, index } = ctx;
  const health = vaultHealth(index);
  const upcoming = nextAssessment(index.assessments, ctx.today);
  const { recommended } = studyOptions(ctx);
  const nextReadiness = upcoming ? readinessLines(ctx).find((r) => r.assessment.id === upcoming.assessment.id) : undefined;
  const hasProfile = getProfileAnswers(getDb(), ctx.student.id, vault.id) !== null;
  const toDo = recommended.counts.fix + recommended.counts.due;
  const courseLine = [index.course.code, index.course.term, index.course.textbook].filter(Boolean).join(" · ");

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight mb-1">
          <span className="gradient-text">{index.course.name}</span>
        </h1>
        <p className="text-slate-500 text-base">
          {courseLine ? `${courseLine} — ` : ""}studying from <Link href={`/vaults/${vault.id}`} className="font-medium text-slate-700 underline underline-offset-2 hover:text-blue-700">{vault.name}</Link>
        </p>
      </div>

      <LegacyImport vaultId={vault.id} vaultName={vault.name} />

      {/* Today */}
      {index.cards.length > 0 && (
        <section aria-labelledby="today" className="mb-8 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-6 sm:p-8 shadow-lg">
          <p id="today" className="text-xs font-semibold uppercase tracking-widest text-blue-100">Today</p>
          <h2 className="text-2xl font-extrabold mt-1">
            {nextReadiness ? nextReadiness.sentence : toDo > 0 ? `${toDo} cards are ready for review` : "Keep it going with a short session"}
          </h2>
          <p className="text-blue-100 mt-1">
            {recommended.label}: {recommended.counts.fix > 0 ? `${recommended.counts.fix} to fix · ` : ""}
            {recommended.counts.due} due · {recommended.counts.fresh} new
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Link href={sessionHref(recommended.scope, "smart")} className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700 focus-visible:ring-white">
              Start a smart session
            </Link>
            <Link href="/study" className="text-sm font-semibold text-white underline underline-offset-2 hover:text-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded">
              Choose what to study
            </Link>
          </div>
        </section>
      )}

      {!hasProfile && index.cards.length > 0 && (
        <p className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <span className="font-semibold">New here?</span> Answer ten quick questions and get a study plan that fits how you work.{" "}
          <Link href="/intake" className="font-semibold text-blue-700 underline underline-offset-2">Make my plan</Link>
        </p>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Units",       value: index.units.length,       border: "border-l-blue-400" },
          { label: "Assessments", value: index.assessments.length, border: "border-l-violet-400" },
          { label: "Notes",       value: index.nodes.length,       border: "border-l-emerald-400" },
          { label: "Flashcards",  value: index.cards.length,       border: "border-l-orange-400" },
        ].map((s) => (
          <div key={s.label} className={`bg-white rounded-2xl border border-slate-100 border-l-4 ${s.border} p-4 shadow-sm`}>
            <div className="text-3xl font-bold text-slate-800 tabular-nums">{s.value}</div>
            <div className="text-sm text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {index.cards.length === 0 && (
        <p className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No flashcards could be made from this vault yet, so the study modes will be empty.{" "}
          <Link href={`/vaults/${vault.id}`} className="font-semibold underline underline-offset-2">Open the health check</Link> to see why.
        </p>
      )}

      {/* Mode grid */}
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">More ways to practise</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {STUDY_MODES.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className={`group block p-4 bg-white rounded-2xl border ${m.bg} hover:shadow-md transition-all duration-200 hover:-translate-y-0.5`}
          >
            <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br ${m.color} text-white text-lg mb-2.5 shadow-sm group-hover:scale-110 transition-transform duration-200`}>
              {m.icon}
            </div>
            <h3 className="font-semibold text-slate-800 text-sm mb-0.5">{m.title}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{m.desc}</p>
          </Link>
        ))}
      </div>

      {/* Units and assessments */}
      <div className="grid md:grid-cols-5 gap-6 mt-10">
        <section aria-labelledby="home-units" className="md:col-span-3">
          <h2 id="home-units" className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Units</h2>
          {health.units.length === 0 ? (
            <p className="text-sm text-slate-500">No units found in this vault yet.</p>
          ) : (
            <ol className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
              {health.units.map(({ unit, nodeCount, cardCount }) => (
                <li key={unit.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <span className="text-sm font-medium text-slate-800">{unit.label}</span>
                  <span className="text-xs text-slate-500 tabular-nums shrink-0">{nodeCount} notes · {cardCount} cards</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section aria-labelledby="home-assessments" className="md:col-span-2">
          <h2 id="home-assessments" className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Assessments</h2>
          {index.assessments.length === 0 ? (
            <p className="text-sm text-slate-500">
              None yet. <Link href={`/vaults/${vault.id}#manifest`} className="font-semibold text-blue-700 underline underline-offset-2">Add them in study.yml</Link>.
            </p>
          ) : (
            <ul className="space-y-2">
              {index.assessments.map((a) => (
                <li key={a.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">{a.label}</span>
                    <span className={`text-xs font-medium ${a.date ? "text-slate-600" : "text-amber-700"}`}>{a.date ?? "No date"}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {a.cumulative ? "Cumulative" : `${a.covers.length} unit${a.covers.length === 1 ? "" : "s"}`}
                    {a.weight !== undefined ? ` · ${a.weight}%` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
