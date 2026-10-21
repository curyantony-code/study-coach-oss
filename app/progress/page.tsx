import { getSchedule } from "@/lib/schedule/store";
import Link from "next/link";
import MathText from "@/components/MathText";
import { redirect } from "next/navigation";
import LegacyImport from "@/components/study/LegacyImport";
import MasteryBar from "@/components/study/MasteryBar";
import NoteTable, { type NoteRow } from "@/components/study/NoteTable";
import { getDb } from "@/lib/db/client";
import { listAttempts, listAttemptTimes } from "@/lib/db/progress";
import { listQuizResults } from "@/lib/db/quiz";
import { calibration, modeResults, streak } from "@/lib/learner/insights";
import { nodeMasteries, unitMasteries } from "@/lib/learner/mastery";
import { readinessLines } from "@/lib/learner/overview";
import { scopeToString } from "@/lib/learner/scope";
import { getStudyContext } from "@/lib/learner/service";
import { sessionHref } from "@/lib/learner/session";
import type { Confidence, StudyMode } from "@/lib/learner/types";
import { localToday } from "@/lib/vault/health";
import { libraryHref } from "@/lib/vault/render";

const CARD = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
const H2 = "text-lg font-bold text-slate-900";
const MIN_ANSWERS_FOR_CALIBRATION = 5;

const CONFIDENCE_LABEL: Record<Confidence, string> = { guessing: "Guessing", "fairly-sure": "Fairly sure", certain: "Certain" };
const MODE_LABEL: Record<StudyMode, string> = {
  "smart-recall": "Recall from memory", "smart-choice": "Confidence quiz", flashcards: "Flashcards", quiz: "Quiz",
  learn: "Learn", write: "Write", match: "Match", arcade: "Arcade", problem: "Worked problems", "guess-first": "Guess first", "mock-exam": "Mock exam", "teach-back": "Teach back",
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default async function ProgressPage() {
  const ctx = await getStudyContext();
  if (!ctx) redirect("/vaults");
  const { index, states, now } = ctx;
  const db = getDb();
  const attempts = listAttempts(db, ctx.student.id, ctx.vault.id);
  const days = streak(listAttemptTimes(db, ctx.student.id).map((t) => localToday(new Date(t))), ctx.today);

  const quizzes = listQuizResults(db, ctx.student.id, ctx.vault.id, 8);
  const readiness = readinessLines(ctx);
  const unitLabels = new Map(index.units.map((u) => [u.id, u.label]));
  const units = unitMasteries(index, states, now);
  const nodes = new Map(index.nodes.map((n) => [n.id, n]));
  const noteRows: NoteRow[] = nodeMasteries(index, states, now)
    .filter((n) => n.mastery !== null)
    .map((n) => ({
      id: n.nodeId,
      title: nodes.get(n.nodeId)!.title,
      href: libraryHref(nodes.get(n.nodeId)!.slug),
      studyHref: sessionHref(scopeToString({ kind: "node", id: n.nodeId, neighbours: false })),
      cards: n.cardCount,
      mastery: n.mastery!,
      confidentWrong: n.confidentWrong,
      lastStudied: n.lastStudied,
    }));

  const cardsById = new Map(index.cards.map((c) => [c.id, c]));
  const confidentMisses = [...states.values()]
    .filter((s) => s.confidentWrong > 0 && cardsById.has(s.cardId))
    .sort((a, b) => Number(b.needsFix) - Number(a.needsFix) || b.confidentWrong - a.confidentWrong);
  const calibrationRows = calibration(attempts);
  const certain = calibrationRows.find((r) => r.confidence === "certain")!;
  const modes = modeResults(attempts);
  const schedule = getSchedule(ctx.vault.id);
  // Dates the app read by itself are used straight away, and said to be unchecked until the student confirms them.
  const unchecked = schedule && !schedule.confirmed && index.assessments.some((a) => a.id.startsWith("outline-")) ? schedule.source : null;
  const seenCards = index.cards.filter((c) => states.has(c.id)).length;

  return (
    <div className="max-w-4xl mx-auto animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold gradient-text mb-1">Progress</h1>
        <p className="text-slate-500 text-sm">
          {index.course.name} · {seenCards} of {index.cards.length} cards studied · {attempts.length} answers ·{" "}
          {days > 0 ? `${days}-day streak` : "no streak yet"}
        </p>
      </header>

      <LegacyImport vaultId={ctx.vault.id} vaultName={ctx.vault.name} />

      {attempts.length === 0 && states.size === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Nothing studied in this vault yet. <Link href="/study" className="font-semibold text-blue-700 underline underline-offset-2">Start a session</Link> and your progress shows up here.
        </p>
      )}

      <section aria-labelledby="readiness" className={CARD}>
        <h2 id="readiness" className={H2}>Assessment readiness</h2>
        <p className="text-sm text-slate-500 mb-4">Predicted recall on the day of each assessment, if you did no more studying. A forecast from your answers, not a grade.</p>
        {unchecked && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            These dates were read from {unchecked} and have not been checked yet.{" "}
            <Link href="/schedule" className="font-semibold underline underline-offset-2">Check them on the Schedule page</Link>.
          </p>
        )}
        {readiness.length === 0 ? (
          <p className="text-sm text-slate-600">
            No test dates were found for this course. <Link href="/schedule" className="font-semibold text-blue-700 underline underline-offset-2">Read your course outline</Link> to see readiness.
          </p>
        ) : (
          <ul className="space-y-4">
            {readiness.map((r) => (
              <li key={r.assessment.id}>
                <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
                  <p className="font-semibold text-slate-900">{r.sentence}</p>
                  {r.cardCount > 0 && (
                    <Link href={sessionHref(scopeToString({ kind: "assessment", id: r.assessment.id }))} className="text-sm font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">
                      Study for this
                    </Link>
                  )}
                </div>
                <MasteryBar mastery={r.cardCount === 0 ? null : r.readiness} label={`${r.assessment.label} readiness`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="by-unit" className={CARD}>
        <h2 id="by-unit" className={H2}>By unit</h2>
        <p className="text-sm text-slate-500 mb-4">Mastery is the chance you would still recall a card a week from now, averaged over the unit.</p>
        {units.length === 0 ? (
          <p className="text-sm text-slate-600">No units in this vault.</p>
        ) : (
          <ul className="space-y-3">
            {units.map((u) => (
              <li key={u.unitId}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-sm font-medium text-slate-800">{unitLabels.get(u.unitId)}</span>
                  <span className="text-xs text-slate-500 tabular-nums shrink-0">{u.seenCount} of {u.cardCount} cards studied</span>
                </div>
                <MasteryBar mastery={u.mastery} label={unitLabels.get(u.unitId) ?? u.unitId} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <section aria-labelledby="calibration" className={CARD}>
          <h2 id="calibration" className={H2}>How accurate is your confidence?</h2>
          {certain.answers >= MIN_ANSWERS_FOR_CALIBRATION ? (
            <p className="text-sm text-slate-700 mt-1 mb-4">
              When you were <strong>certain</strong>, you were right <strong>{percent(certain.accuracy!)}</strong> of the time.
            </p>
          ) : (
            <p className="text-sm text-slate-500 mt-1 mb-4">Answer a few more cards with a confidence rating to see this.</p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th scope="col" className="pb-1 font-semibold">You said</th>
                <th scope="col" className="pb-1 font-semibold text-right">Answers</th>
                <th scope="col" className="pb-1 font-semibold text-right">Right</th>
              </tr>
            </thead>
            <tbody>
              {calibrationRows.map((row) => (
                <tr key={row.confidence} className="border-t border-slate-100">
                  <th scope="row" className="py-1.5 text-left font-medium text-slate-800">{CONFIDENCE_LABEL[row.confidence]}</th>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">{row.answers}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">{row.accuracy === null ? "–" : percent(row.accuracy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="best-mode" className={CARD}>
          <h2 id="best-mode" className={H2}>What makes it stick</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">How you do on later reviews of cards, by the mode you first studied them in.</p>
          {modes.length === 0 ? (
            <p className="text-sm text-slate-600">Not enough reviews yet. This needs cards you have come back to on a later day.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {modes.map((m, i) => (
                <li key={m.mode} className="flex items-baseline justify-between gap-3">
                  <span className={i === 0 ? "font-semibold text-slate-900" : "text-slate-700"}>{MODE_LABEL[m.mode]}</span>
                  <span className="tabular-nums text-slate-600">{percent(m.accuracy)} right on {m.laterReviews} later reviews</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {quizzes.length > 0 && (
        <section aria-labelledby="quizzes" className={CARD}>
          <h2 id="quizzes" className={H2}>Recent quizzes</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {quizzes.map((quiz, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-slate-700">
                  <span className="font-medium text-slate-900">{quiz.topic || "Whole course"}</span>
                  <span className="text-slate-500"> · {quiz.source === "ai" ? "AI-written" : "Ready-made"} · {localToday(new Date(quiz.takenAt))}</span>
                </span>
                <span className={`tabular-nums font-semibold ${quiz.score / quiz.total >= 0.7 ? "text-emerald-700" : "text-rose-700"}`}>
                  {quiz.score}/{quiz.total}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="confident-wrong" className={CARD}>
        <h2 id="confident-wrong" className={H2}>Sure, but wrong</h2>
        <p className="text-sm text-slate-500 mt-1 mb-4">Cards you were certain about and missed. Fixing these is the fastest win.</p>
        {confidentMisses.length === 0 ? (
          <p className="text-sm text-slate-600">None so far.</p>
        ) : (
          <ul className="space-y-3">
            {confidentMisses.map((s) => {
              const card = cardsById.get(s.cardId)!;
              return (
                <li key={s.cardId} className="text-sm border-l-4 border-rose-300 pl-3">
                  <p className="font-semibold text-slate-900">
                    <MathText text={card.front} />
                    <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${s.needsFix ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {s.needsFix ? "Still to fix" : "Fixed since"}
                    </span>
                  </p>
                  <p className="text-slate-700"><MathText text={card.back} /></p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="by-note" className={CARD}>
        <h2 id="by-note" className={`${H2} mb-4`}>By note</h2>
        {noteRows.length === 0 ? <p className="text-sm text-slate-600">No notes with cards.</p> : <NoteTable rows={noteRows} />}
      </section>
    </div>
  );
}
