import Link from "next/link";
import { redirect } from "next/navigation";
import IntakeForm from "@/components/study/IntakeForm";
import { getDb } from "@/lib/db/client";
import { getProfileAnswers } from "@/lib/db/progress";
import { adviceFor, profileSchema } from "@/lib/learner/profile";
import { getStudyContext } from "@/lib/learner/service";
import { nextAssessment } from "@/lib/vault/health";

export default async function IntakePage() {
  const ctx = await getStudyContext();
  if (!ctx) redirect("/vaults");

  const saved = profileSchema.safeParse(getProfileAnswers(getDb(), ctx.student.id, ctx.vault.id));
  const profile = saved.success ? saved.data : null;
  const upcoming = nextAssessment(ctx.index.assessments, ctx.today);
  const advice = profile ? adviceFor(profile, upcoming?.daysAway ?? null) : null;

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <h1 className="text-3xl font-extrabold gradient-text mb-1">How you study</h1>
      <p className="text-slate-500 text-sm mb-8">
        Ten quick questions for {ctx.index.course.name}. Your answers stay on this computer and only change what Study Coach suggests.
        {upcoming ? ` Your next assessment (${upcoming.assessment.label}) is taken from the vault, so you are not asked for it.` : ""}
      </p>

      {advice && (
        <section aria-labelledby="your-plan" className="mb-8 rounded-3xl border border-blue-200 bg-white p-6 shadow-sm">
          <h2 id="your-plan" className="text-lg font-bold text-slate-900 mb-3">Your plan</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700">
            {advice.plan.map((line) => <li key={line}>{line}</li>)}
          </ul>
          {advice.flags.length > 0 && (
            <>
              <h3 className="text-sm font-bold text-amber-900 mt-5 mb-2">Worth changing</h3>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-amber-900">
                {advice.flags.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </>
          )}
          <Link href="/study" className="inline-block mt-5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500">
            Start studying
          </Link>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <IntakeForm profile={profile} studentName={ctx.student.name} />
      </section>
    </div>
  );
}
