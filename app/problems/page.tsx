import Link from "next/link";
import { redirect } from "next/navigation";
import MathText from "@/components/MathText";
import QuestionStylePicker from "@/components/problems/QuestionStylePicker";
import WriteOutAll from "@/components/problems/WriteOutAll";
import { getQuestionStyle, needsWritingOut } from "@/lib/problems/fixes";
import OutlineForm from "@/components/problems/OutlineForm";
import { explainProvider, PROVIDER_LABEL } from "@/lib/ai/explain";
import { questionIssues } from "@/lib/questions/rules";
import TextbookForm from "@/components/problems/TextbookForm";
import { getDb } from "@/lib/db/client";
import { getTextbookImport, listVaultPdfs } from "@/lib/problems/import";
import { getStudyContext } from "@/lib/learner/service";
import type { ProblemEntry, ProblemSection, ProblemStatus } from "@/lib/problems/outline";
import { getProblemsView } from "@/lib/problems/service";

const STATUS: Record<ProblemStatus, { label: string; chip: string }> = {
  new: { label: "Not tried", chip: "bg-slate-100 text-slate-600" },
  got: { label: "Got it", chip: "bg-emerald-100 text-emerald-800" },
  missed: { label: "Missed", chip: "bg-rose-100 text-rose-800" },
};

function entryStatus(entry: ProblemEntry, status: Map<string, ProblemStatus>): ProblemStatus {
  return entry.problem ? status.get(entry.problem.card.id) ?? "new" : "new";
}

function Row({ entry, status }: { entry: ProblemEntry; status: Map<string, ProblemStatus> }) {
  if (!entry.problem) {
    return (
      <li className="flex items-baseline justify-between gap-3 px-4 py-2.5">
        <span className="text-sm text-slate-500"><span className="font-semibold text-slate-600">{entry.label}</span> · not written up in your notes yet</span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">No write-up</span>
      </li>
    );
  }
  const { card, parsed } = entry.problem;
  const state = STATUS[entryStatus(entry, status)];
  const title = parsed?.title || card.problem!.heading;
  return (
    <li>
      <Link href={`/problems/${card.id}`}
        className="flex items-baseline justify-between gap-3 px-4 py-2.5 hover:bg-blue-50 active:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
        <span className="text-sm text-slate-800 min-w-0">
          {parsed && entry.label !== card.problem!.heading && <span className="font-semibold">{entry.label} · </span>}
          <MathText text={title} />
          {entry.sharedWith > 0 && <span className="text-slate-500"> (one write-up covers {entry.sharedWith + 1} problems)</span>}
          {card.problem!.original?.uncertain && <span className="ml-2 text-xs font-semibold text-amber-800">check wording</span>}
        </span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${state.chip}`}>{state.label}</span>
      </Link>
    </li>
  );
}

function Section({ section, status }: { section: ProblemSection; status: Map<string, ProblemStatus> }) {
  const written = section.entries.filter((e) => e.problem);
  const got = written.filter((e) => entryStatus(e, status) === "got").length;
  const first = written.find((e) => entryStatus(e, status) !== "got") ?? written[0];
  return (
    <section id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-24">
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <h2 id={`${section.id}-title`} className="text-lg font-bold text-slate-900">{section.title}</h2>
        <span className="text-sm text-slate-500 tabular-nums">
          {got} of {section.entries.length} done
          {first && (
            <>
              {" · "}
              <Link href={`/problems/${first.problem!.card.id}`} className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">
                {got > 0 && got < written.length ? "Continue" : "Start"}
              </Link>
            </>
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-200 mb-3 overflow-hidden" role="img" aria-label={`${got} of ${section.entries.length} done`}>
        <div className="h-1.5 bg-emerald-500 origin-left" style={{ transform: `scaleX(${section.entries.length === 0 ? 0 : got / section.entries.length})` }} />
      </div>
      <ul className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
        {section.entries.map((entry) => <Row key={entry.key} entry={entry} status={status} />)}
      </ul>
    </section>
  );
}

export default async function ProblemsPage() {
  const ctx = await getStudyContext();
  if (!ctx) redirect("/vaults");
  const { set, outlineText, status } = getProblemsView(ctx);
  const entries = set.sections.flatMap((s) => s.entries);
  const missing = entries.filter((e) => !e.problem).length;
  const got = set.order.filter((p) => status.get(p.card.id) === "got").length;
  const textbook = getTextbookImport(getDb(), ctx.vault.id);
  const uncertain = set.order.filter((p) => p.card.problem?.original?.uncertain).length;

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <h1 className="text-3xl font-extrabold gradient-text mb-1">Problems</h1>
      <p className="text-slate-500 text-sm mb-6">
        {set.order.length === 0
          ? `No worked problems were found in ${ctx.index.course.name}.`
          : `${set.order.length} worked problems in ${ctx.index.course.name} · ${got} done${set.fromOutline ? " · laid out by your course outline" : " · grouped by the chapters in your notes"}${missing > 0 ? ` · ${missing} assigned problems have no write-up yet` : ""}`}
      </p>

      {set.order.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 mb-6">
          A worked problem is a heading in a note followed by a line starting with <strong>**Solution.**</strong> — optionally with{" "}
          <strong>**Problem.**</strong> and <strong>**Formula required:**</strong> lines before it. Headings like “Ch7-P4 …” or “Ch9-CFA5 …” are matched to the course outline.
        </p>
      ) : (
        <nav aria-label="Chapters" className="flex flex-wrap gap-2 mb-6">
          {set.sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              {s.title.replace("Chapter ", "Ch ")}
            </a>
          ))}
        </nav>
      )}

      <div className="mb-8 space-y-3">
        <OutlineForm outlineText={outlineText} open={!set.fromOutline && set.order.length > 0} />
        <WriteOutAll
          key={set.order.filter((p) => needsWritingOut(p.card)).length}
          pending={set.order.filter((p) => needsWritingOut(p.card)).length}
          unclear={set.order.filter((p) => needsWritingOut(p.card) && questionIssues(p.card.front, p.card.back, p.card.problem!.heading).length > 0).length}
          total={set.order.length}
          providerLabel={PROVIDER_LABEL[explainProvider()]}
        />
        {set.order.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-700">Show questions</span>
            <QuestionStylePicker style={getQuestionStyle(getDb())} />
          </div>
        )}
        {set.order.length > 0 && (
          <TextbookForm
            pdfs={listVaultPdfs(ctx.vault.path)}
            importedFile={textbook?.file ?? null}
            matched={set.order.filter((p) => p.card.problem?.original).length}
            total={set.order.length}
            open={false}
          />
        )}
        {uncertain > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {uncertain} problem{uncertain === 1 ? "" : "s"} may be matched to the wrong textbook question (the wording differs a lot from your notes). They are marked “check wording” below.
          </p>
        )}
      </div>

      <div className="space-y-8">
        {set.sections.map((section) => <Section key={section.id} section={section} status={status} />)}
      </div>
    </div>
  );
}
