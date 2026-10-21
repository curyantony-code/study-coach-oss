"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import MathText from "@/components/MathText";
import type { ApiResponse } from "@/lib/api";
import type { ExamQuestion, ExamResult } from "@/lib/learner/exam";

interface Paper {
  paperId: string;
  label: string;
  questions: ExamQuestion[];
  minutes: number;
  unitLabels: Record<string, string>;
}

type Phase = "loading" | "failed" | "intro" | "running" | "marking" | "review" | "saved";

const PRIMARY = "rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
const SECONDARY = "rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";

function clock(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export default function ExamRunner({ scope, count }: { scope: string; count: number }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [paper, setPaper] = useState<Paper | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [selfMarks, setSelfMarks] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<ExamResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [saving, setSaving] = useState(false);
  const deadline = useRef(0);
  /** Latest answers, readable from the timer without restarting it on every keystroke. */
  const responsesRef = useRef(responses);
  /** Set once the clock has submitted the paper, so a failed request is not retried in a loop. */
  const timerSubmitted = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    responsesRef.current = responses;
  }, [responses]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/exam?${new URLSearchParams({ scope, count: String(count) })}`)
      .then((r) => r.json() as Promise<ApiResponse<Paper>>)
      .then((body) => {
        if (cancelled) return;
        if (!body.success || !body.data) {
          setError(body.error ?? "The exam could not be built.");
          return setPhase("failed");
        }
        setPaper(body.data);
        setPhase("intro");
      })
      .catch(() => {
        if (cancelled) return;
        setError("The exam could not be built. Check that Study Coach is still running.");
        setPhase("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [scope, count]);

  const mark = useCallback(
    async (record: boolean, marks: Record<string, boolean>) => {
      if (!paper || inFlight.current) return;
      inFlight.current = true;
      setSaving(record);
      setError("");
      try {
        const response = await fetch("/api/exam/mark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paperId: paper.paperId,
            answers: paper.questions.map((q) => ({ cardId: q.cardId, response: responsesRef.current[q.cardId] ?? "", selfMark: q.kind === "written" ? marks[q.cardId] ?? null : null })),
            record,
          }),
        });
        const body = (await response.json()) as ApiResponse<ExamResult & { recorded: boolean }>;
        if (!body.success || !body.data) throw new Error(body.error ?? "The exam could not be marked.");
        setResult(body.data);
        setPhase(body.data.recorded ? "saved" : "review");
      } catch (err) {
        setError(err instanceof Error ? err.message : "The exam could not be marked.");
        setPhase((p) => (p === "marking" ? "running" : p));
      } finally {
        inFlight.current = false;
        setSaving(false);
      }
    },
    [paper]
  );

  const submit = useCallback(() => {
    setPhase("marking");
    void mark(false, {});
  }, [mark]);

  // The countdown follows the wall clock, so a sleeping tab cannot stretch the exam.
  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => {
      const left = Math.ceil((deadline.current - Date.now()) / 1000);
      setSecondsLeft(left);
      // Time is up: submit once. If that fails, the student can press Submit to try again.
      if (left <= 0 && !timerSubmitted.current) {
        timerSubmitted.current = true;
        submit();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [phase, submit]);

  if (phase === "loading") return <p role="status" className="text-center py-20 text-slate-500">Building your exam…</p>;
  if (phase === "failed" || !paper) {
    return (
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
        <p className="font-semibold mb-3">{error}</p>
        <Link href="/exam" className={SECONDARY}>Back</Link>
      </div>
    );
  }
  if (paper.questions.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h2 className="text-xl font-bold text-slate-900 mb-2">No questions to draw from</h2>
        <p className="text-slate-600 mb-5">“{paper.label}” has no cards yet.</p>
        <Link href="/exam" className={PRIMARY}>Back</Link>
      </div>
    );
  }

  if (phase === "intro") {
    const written = paper.questions.filter((q) => q.kind === "written").length;
    return (
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">Mock exam</p>
        <h2 className="text-2xl font-extrabold text-slate-900 mb-4">{paper.label}</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700 mb-6">
          <li><strong>{paper.questions.length} questions</strong> in <strong>{paper.minutes} minutes</strong>, mixed across units.</li>
          <li>{paper.questions.length - written} multiple choice{written > 0 ? ` and ${written} written` : ""}. No hints and no feedback until you submit.</li>
          <li>When time runs out, the exam is submitted as it stands.</li>
          {written > 0 && <li>You mark your own written answers against the model answer afterwards.</li>}
          <li>Your result counts toward your progress, like any other study.</li>
        </ul>
        <button type="button" className={PRIMARY} onClick={() => { deadline.current = Date.now() + paper.minutes * 60_000; setPhase("running"); }}>
          Start the clock
        </button>
      </section>
    );
  }

  if (phase === "running" || phase === "marking") {
    const answered = paper.questions.filter((q) => (responses[q.cardId] ?? "").trim() !== "").length;
    const low = secondsLeft <= 60;
    return (
      <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="sticky top-0 md:top-2 z-10 mb-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur">
          <span className="text-sm text-slate-600 tabular-nums">{answered} of {paper.questions.length} answered</span>
          <span role="timer" aria-label={`Time left: ${clock(secondsLeft)}`} className={`text-lg font-bold tabular-nums ${low ? "text-rose-700" : "text-slate-900"}`}>{clock(secondsLeft)}</span>
        </div>
        {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        <ol className="space-y-5">
          {paper.questions.map((q, i) => (
            <li key={q.cardId} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              {q.kind === "choice" ? (
                <fieldset className="border-0 p-0 m-0">
                  <legend className="font-semibold text-slate-900 mb-3"><span className="text-slate-400 mr-2 tabular-nums">{i + 1}.</span><MathText text={q.prompt} /></legend>
                  <div className="space-y-2">
                    {q.options.map((option) => (
                      <label key={option} className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm text-slate-800 hover:border-blue-400 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500">
                        <input type="radio" name={`q-${q.cardId}`} checked={responses[q.cardId] === option} onChange={() => setResponses((r) => ({ ...r, [q.cardId]: option }))} className="mt-1 accent-blue-600" />
                        <span className="min-w-0"><MathText text={option} /></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <>
                  <label htmlFor={`q-${q.cardId}`} className="block font-semibold text-slate-900 mb-3"><span className="text-slate-400 mr-2 tabular-nums">{i + 1}.</span><MathText text={q.prompt} /></label>
                  <textarea id={`q-${q.cardId}`} rows={3} value={responses[q.cardId] ?? ""} onChange={(event) => setResponses((r) => ({ ...r, [q.cardId]: event.target.value }))}
                    placeholder="Write your answer" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
                </>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-6 flex items-center gap-4">
          <button type="submit" className={PRIMARY} disabled={phase === "marking"}>{phase === "marking" ? "Marking…" : "Submit exam"}</button>
          <span className="text-sm text-slate-500">{paper.questions.length - answered > 0 ? `${paper.questions.length - answered} left blank` : "All answered"}</span>
        </div>
      </form>
    );
  }

  if (!result) return null;
  const percent = result.total === 0 ? 0 : Math.round((result.correct / result.total) * 100);
  const waiting = result.marked.filter((m) => m.kind === "written" && m.response.trim() !== "" && selfMarks[m.cardId] === undefined).length;

  return (
    <div>
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-6" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">{paper.label}</p>
        {phase === "saved" ? (
          <>
            <h2 className="text-2xl font-extrabold text-slate-900 mb-1">{percent}% <span className="text-lg font-semibold text-slate-600">· {result.correct} of {result.total}</span></h2>
            <p className="text-sm text-slate-600 mb-4">Saved. Missed questions come back sooner in your study sessions.</p>
            <ul className="space-y-1 text-sm text-slate-700 mb-5">
              {result.byUnit.map((u) => (
                <li key={u.unitId ?? "none"} className="flex justify-between gap-3 max-w-md">
                  <span>{u.unitId ? paper.unitLabels[u.unitId] ?? u.unitId : "Not in a unit"}</span>
                  <span className="tabular-nums font-semibold">{u.correct} of {u.total}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Link href="/progress" className={PRIMARY}>See my progress</Link>
              <Link href="/exam" className={SECONDARY}>Another exam</Link>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-extrabold text-slate-900 mb-1">Time to mark</h2>
            <p className="text-sm text-slate-600 mb-4">
              Multiple choice is marked. {result.unmarked > 0 ? "For each written answer, compare it with the model answer and mark it honestly: an answer that misses the key point is a miss." : "Nothing left to mark."}
            </p>
            {error && <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
            <button type="button" className={PRIMARY} disabled={waiting > 0 || saving} onClick={() => mark(true, selfMarks)}>
              {saving ? "Saving…" : waiting > 0 ? `Mark ${waiting} written answer${waiting === 1 ? "" : "s"} first` : "Save my result"}
            </button>
          </>
        )}
      </section>

      <ol className="space-y-4">
        {result.marked.map((m, i) => {
          const selfMarked = selfMarks[m.cardId];
          const verdict = m.correct ?? selfMarked ?? null;
          return (
            <li key={m.cardId} className={`bg-white rounded-2xl border-2 p-5 ${verdict === true ? "border-emerald-300" : verdict === false ? "border-rose-300" : "border-slate-200"}`}>
              <p className="font-semibold text-slate-900 mb-2"><span className="text-slate-400 mr-2 tabular-nums">{i + 1}.</span><MathText text={m.prompt} /></p>
              <p className="text-sm text-slate-600 mb-1"><span className="font-semibold text-slate-700">Your answer: </span>{m.response.trim() === "" ? <em>left blank</em> : <span className="whitespace-pre-line"><MathText text={m.response} /></span>}</p>
              <p className="text-sm text-slate-900"><span className="font-semibold">Model answer: </span><span className="whitespace-pre-line"><MathText text={m.answer} /></span></p>
              {m.correct === null && phase === "review" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700">Did you have it?</span>
                  <button type="button" aria-pressed={selfMarked === false} onClick={() => setSelfMarks((s) => ({ ...s, [m.cardId]: false }))} className={`${SECONDARY} ${selfMarked === false ? "border-rose-500 bg-rose-50" : ""}`}>Missed it</button>
                  <button type="button" aria-pressed={selfMarked === true} onClick={() => setSelfMarks((s) => ({ ...s, [m.cardId]: true }))} className={`${SECONDARY} ${selfMarked === true ? "border-emerald-500 bg-emerald-50" : ""}`}>Got it</button>
                </div>
              ) : (
                <p className={`mt-2 text-sm font-semibold ${verdict ? "text-emerald-700" : "text-rose-700"}`}>{verdict ? "✓ Correct" : "✗ Missed"}</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
