import Link from "next/link";
import StudySession from "@/components/study/StudySession";
import { explainProvider, PROVIDER_LABEL } from "@/lib/ai/explain";
import { DEFAULT_SESSION_SIZE } from "@/lib/learner/queue";
import { parseSessionMode } from "@/lib/learner/session";

const MAX_SIZE = 50;
const TITLES = { smart: "Smart session", flashcards: "Flashcards", quiz: "Confidence quiz" } as const;

export default async function SessionPage({ searchParams }: { searchParams: Promise<{ scope?: string; mode?: string; size?: string }> }) {
  const params = await searchParams;
  const mode = parseSessionMode(params.mode);
  const requested = Number.parseInt(params.size ?? "", 10);
  const size = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_SIZE) : DEFAULT_SESSION_SIZE;
  const scope = params.scope || "course";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-baseline justify-between gap-3 mb-6">
        <h1 className="text-3xl font-extrabold gradient-text">{TITLES[mode]}</h1>
        <Link href="/study" className="text-sm font-semibold text-slate-600 underline underline-offset-2 hover:text-blue-700">
          Change what I study
        </Link>
      </div>
      <StudySession key={`${scope}|${mode}|${size}`} scope={scope} mode={mode} size={size} providerLabel={PROVIDER_LABEL[explainProvider()]} />
    </div>
  );
}
