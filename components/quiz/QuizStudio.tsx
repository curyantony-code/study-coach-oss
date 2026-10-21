"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import QuizQuestion from "@/components/QuizQuestion";
import { logAttempt } from "@/lib/study-client";
import { useCourse } from "@/lib/use-course";

interface Question {
  stem: string;
  options: { text: string; correct: boolean }[];
  explanation: string;
  sourceSlug: string;
  /** Ready-made questions carry an id; AI-written ones do not. */
  id?: string;
  cardId?: string;
  basedOn?: { cardId: string; heading: string };
}

type Part = "midterm" | "final";
const PART_LABEL: Record<Part, string> = { midterm: "Midterm", final: "Final" };
const FIELD = "w-full border border-slate-200 rounded-xl px-4 py-2.5 bg-white text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300";
const CHOICE = "flex-1 py-2 rounded-xl border-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";

/**
 * The quiz screen, in two forms:
 *  - "quiz": pick any one topic (or a unit, or everything); ready-made or AI-written.
 *  - "exam": an AI mock exam with a Midterm / Final setting.
 * AI-written questions are modelled on the worked examples in the chosen material.
 */
export default function QuizStudio({ variant }: { variant: "quiz" | "exam" }) {
  const course = useCourse();
  const isExam = variant === "exam";
  const [mode, setMode] = useState<"config" | "running" | "done">("config");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /** "all", "unit:<id>" or "note:<slug>". */
  const [topic, setTopic] = useState("all");
  const [part, setPart] = useState<Part>("midterm");
  const [count, setCount] = useState(isExam ? 20 : 10);
  const [aiMode, setAiMode] = useState(isExam);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    if (mode !== "running") return;
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 1000);
    return () => clearInterval(t);
  }, [mode]);

  const chosenNote = topic.startsWith("note:") ? course.topics.find((t) => t.slug === topic.slice(5)) : undefined;
  const chosenUnit = topic.startsWith("unit:") ? course.units.find((u) => u.id === topic.slice(5)) : undefined;
  const topicLabel = isExam ? `${PART_LABEL[part]} mock exam` : chosenNote?.label ?? chosenUnit?.label ?? "";
  const partInfo = course.parts?.[part];
  // How many worked examples the AI has to model questions on, for the chosen material.
  const examples = isExam
    ? partInfo?.examples ?? 0
    : chosenNote
      ? chosenNote.examples
      : course.topics.filter((t) => !chosenUnit || t.unitLabel === chosenUnit.label).reduce((sum, t) => sum + t.examples, 0);

  const start = async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ mode: aiMode ? "ai" : "static", n: String(count) });
    if (isExam) params.set("part", part);
    else if (chosenNote) params.set("note", chosenNote.slug);
    else if (chosenUnit) params.set("topic", chosenUnit.id);
    try {
      const response = await fetch(`/api/quiz?${params}`);
      if (!response.ok) throw new Error("The questions could not be loaded. Try again in a moment.");
      const qs = (await response.json()) as Question[];
      if (!Array.isArray(qs) || qs.length === 0) throw new Error("No questions could be made for that. Try another topic, or the ready-made source.");
      setQuestions(qs);
      setAnswers(new Array(qs.length).fill(null));
      setQIndex(0);
      startRef.current = Date.now();
      setElapsed(0);
      setMode("running");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The questions could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  /** Keeps the score, and counts each card-made question as a review of its card. */
  const finish = () => {
    const right = (i: number) => answers[i] !== null && Boolean(questions[i]?.options[answers[i]!]?.correct);
    questions.forEach((q, i) => {
      if (q.cardId && answers[i] !== null) void logAttempt({ cardId: q.cardId, mode: "quiz", correct: right(i), scope: "course" });
    });
    void fetch("/api/quiz/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: topicLabel,
        source: questions.some((q) => !q.id) ? "ai" : "ready",
        score: questions.filter((_, i) => right(i)).length,
        total: questions.length,
      }),
    }).catch(() => undefined);
    setMode("done");
  };

  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const score = answers.filter((a, i) => a !== null && questions[i]?.options[a]?.correct).length;
  const title = isExam ? "AI mock exam" : "Quiz";

  if (mode === "config") {
    // Notes grouped under their unit, in the course's order.
    const groups = [...new Set(course.topics.map((t) => t.unitLabel))];
    return (
      <div className="max-w-lg mx-auto animate-fade-in">
        <h1 className="text-3xl font-extrabold gradient-text mb-2">{title}</h1>
        <p className="text-slate-500 mb-8">
          {isExam
            ? "New questions modelled on your worked examples, across everything the exam covers."
            : "Pick any one topic, a whole unit, or everything."}
        </p>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
          {isExam ? (
            <fieldset>
              <legend className="block text-sm font-semibold text-slate-700 mb-2">Which exam</legend>
              <div className="flex gap-2">
                {(["midterm", "final"] as Part[]).map((p) => (
                  <button key={p} type="button" aria-pressed={part === p} onClick={() => setPart(p)}
                    className={`${CHOICE} ${part === p ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                    {PART_LABEL[p]}
                  </button>
                ))}
              </div>
              {partInfo && (
                <p className="mt-2 text-xs text-slate-500">
                  Covers {partInfo.notes} note{partInfo.notes === 1 ? "" : "s"}: {partInfo.basis}. {partInfo.examples} worked example{partInfo.examples === 1 ? "" : "s"} to model questions on.
                </p>
              )}
            </fieldset>
          ) : (
            <div>
              <label htmlFor="quiz-topic" className="block text-sm font-semibold text-slate-700 mb-2">Topic</label>
              <select id="quiz-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className={FIELD}>
                <option value="all">Everything</option>
                {groups.map((group) => {
                  const unit = course.units.find((u) => u.label === group);
                  const notes = course.topics.filter((t) => t.unitLabel === group);
                  return (
                    <optgroup key={group || "other"} label={group || "Other notes"}>
                      {unit && notes.length > 1 && <option value={`unit:${unit.id}`}>All of {group}</option>}
                      {notes.map((t) => <option key={t.slug} value={`note:${t.slug}`}>{t.label}</option>)}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          )}

          <fieldset>
            <legend className="block text-sm font-semibold text-slate-700 mb-2">Questions</legend>
            <div className="flex gap-2">
              {(isExam ? [10, 20, 30] : [5, 10, 15, 20]).map((n) => (
                <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)}
                  className={`${CHOICE} ${count === n ? "border-rose-400 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                  {n}
                </button>
              ))}
            </div>
          </fieldset>

          {!isExam && (
            <fieldset>
              <legend className="block text-sm font-semibold text-slate-700 mb-2">Source</legend>
              <div className="flex gap-2">
                {[{ v: false, l: "Ready-made (offline)" }, { v: true, l: "AI-written ✨" }].map(({ v, l }) => (
                  <button key={String(v)} type="button" aria-pressed={aiMode === v} onClick={() => setAiMode(v)}
                    className={`${CHOICE} ${aiMode === v ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {aiMode && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {examples > 0
                ? `The AI takes worked examples from your notes (${examples} here) and writes new questions that are solved the same way, with the numbers and details changed.`
                : "There are no worked examples in this material, so the AI writes concept questions from the notes instead."}{" "}
              This can take a couple of minutes. If the AI falls short, ready-made questions fill the gap.
            </p>
          )}

          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
          <button type="button" onClick={start} disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-rose-400">
            {loading ? (aiMode ? "Writing questions…" : "Loading…") : isExam ? "Start the exam" : "Start quiz"}
          </button>
          {isExam && <p className="text-center text-xs text-slate-500">Prefer questions drawn from your own cards? <Link href="/exam" className="underline underline-offset-2 hover:text-slate-700">Use the standard mock exam</Link>.</p>}
        </div>
      </div>
    );
  }

  if (mode === "running") {
    const q = questions[qIndex];
    const pct = Math.round(((qIndex + 1) / questions.length) * 100);
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-slate-800">{topicLabel || title}</h1>
          <span className="font-mono text-sm text-slate-500">{fmt(elapsed)}</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-1.5 mb-8">
          <div className="progress-bar h-1.5" style={{ width: `${pct}%` }} />
        </div>
        <QuizQuestion stem={q.stem} options={q.options} explanation={q.explanation} sourceSlug={q.sourceSlug} basedOn={q.basedOn}
          index={qIndex} total={questions.length} selected={answers[qIndex]} onSelect={(i) => {
            setAnswers((prev) => { const next = [...prev]; next[qIndex] = i; return next; });
          }} />
        <div className="flex justify-between mt-8">
          <button type="button" onClick={() => setQIndex((i) => Math.max(i - 1, 0))} disabled={qIndex === 0}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium disabled:opacity-30 hover:bg-slate-50 text-slate-600">
            ← Prev
          </button>
          {qIndex < questions.length - 1 ? (
            <button type="button" onClick={() => setQIndex((i) => i + 1)} disabled={answers[qIndex] === null}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-rose-500 to-pink-500 hover:opacity-90 disabled:opacity-30">
              Next →
            </button>
          ) : (
            <button type="button" onClick={finish} disabled={answers[qIndex] === null}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 disabled:opacity-30">
              Finish ✓
            </button>
          )}
        </div>
      </div>
    );
  }

  const incorrect = questions.filter((q, i) => answers[i] !== null && !q.options[answers[i]!]?.correct);
  const pct = Math.round((score / questions.length) * 100);
  const modelled = questions.filter((q) => q.basedOn).length;
  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <h1 className="text-3xl font-extrabold gradient-text mb-6">Results</h1>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 mb-6 text-center">
        <div className={`text-6xl font-extrabold mb-1 ${pct >= 70 ? "text-emerald-500" : "text-red-500"}`}>{pct}%</div>
        <p className="text-slate-400 text-sm">{score}/{questions.length} correct · {fmt(elapsed)}</p>
        <div className="w-full bg-slate-100 rounded-full h-2 mt-4">
          <div className={`h-2 rounded-full transition-all ${pct >= 70 ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
        </div>
        {modelled > 0 && <p className="mt-3 text-xs text-slate-500">{modelled} of these were new questions modelled on your worked examples.</p>}
      </div>
      {incorrect.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Go back over</h2>
          <div className="space-y-2">
            {[...new Map(incorrect.map((q) => [q.basedOn?.cardId ?? q.sourceSlug, q])).values()].map((q) => (
              <Link key={q.basedOn?.cardId ?? q.sourceSlug}
                href={q.basedOn ? `/problems/${q.basedOn.cardId}` : `/browse/${q.sourceSlug.split("/").map(encodeURIComponent).join("/")}`}
                className="flex items-center gap-2 p-3 border border-red-100 bg-red-50 rounded-xl text-sm text-red-700 hover:bg-red-100 transition-colors">
                <span className="text-red-400">→</span>
                {q.basedOn ? `Worked example: ${q.basedOn.heading}` : q.sourceSlug.split("/").pop()?.replace(/-/g, " ")}
              </Link>
            ))}
          </div>
        </div>
      )}
      <p className="mb-4 text-center text-xs text-slate-500">Saved to your <Link href="/progress" className="underline underline-offset-2 hover:text-slate-700">progress</Link>.</p>
      <button type="button" onClick={() => setMode("config")}
        className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-90 transition-opacity">
        {isExam ? "Another exam" : "Try again"}
      </button>
    </div>
  );
}
