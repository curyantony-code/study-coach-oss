"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResponse } from "@/lib/api";
import QuestionStylePicker from "@/components/problems/QuestionStylePicker";
import type { QuestionStyle } from "@/lib/problems/fixes";
import MathText from "@/components/MathText";
import type { ProblemStatus } from "@/lib/problems/outline";
import { logAttempt } from "@/lib/study-client";

export interface ProblemViewerProps {
  cardId: string;
  statement: string;
  formula: string | null;
  solution: string;
  lastResult: ProblemStatus;
  nextHref: string | null;
  /** Present when `statement` is the textbook's full wording rather than the note's summary. */
  original: { source: string; noteVersion: string; uncertain: boolean; completed?: boolean } | null;
  /** Ways the note's wording breaks the "answerable on its own" rule, one plain sentence each. */
  issues: string[];
  /** The wording the student has chosen to see. */
  style: QuestionStyle;
  /** The AI-written wordings, once they exist. */
  versions: { full: string; condensed: string | null; note: string } | null;
  /** Who the question and its solution are sent to when the AI completes it. */
  providerLabel: string;
}

const PRIMARY = "rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
const SECONDARY = "rounded-xl border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400 active:bg-slate-100 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";

/** Lines of a solution, each typeset separately so line breaks in the note are kept. */
function Lines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").filter((line) => line.trim() !== "").map((line, i) => (
        <p key={i} className="mb-2 last:mb-0"><MathText text={line} /></p>
      ))}
    </>
  );
}

const SMALL = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

type Versions = NonNullable<ProblemViewerProps["versions"]>;
type Intent = "complete" | "report" | "revert";

export default function ProblemViewer({ cardId, statement, formula, solution, lastResult, nextHref, original, issues, providerLabel, style, versions }: ProblemViewerProps) {
  const router = useRouter();
  const textbook = original !== null && !original.completed;
  // The wordings and the chosen view live here, so switching between them or receiving a
  // freshly written question changes this card alone: the page is never reloaded for it.
  const [view, setView] = useState<QuestionStyle>(style);
  const [wordings, setWordings] = useState<Versions | null>(versions);
  const [noteText] = useState(versions?.note ?? statement);
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState("");
  const [fixNote, setFixNote] = useState("");
  const [declined, setDeclined] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [marked, setMarked] = useState<ProblemStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const askedFor = useRef(false);
  const mounted = useRef(true);
  // Set on every mount: in development React mounts, unmounts and mounts again.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /** Asks the app, in the background, to write, rewrite or discard this question's AI wording. */
  const send = useCallback(
    async (intent: Intent, feedback = "") => {
      setFixing(true);
      setFixError("");
      setFixNote("");
      try {
        const response = await fetch("/api/problems/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId, intent, feedback }) });
        const body = (await response.json()) as ApiResponse<{ versions: Versions | null }>;
        // The student may have moved to another problem while this one was being written.
        if (!mounted.current) return;
        if (!body.success || !body.data) throw new Error(body.error ?? "The question could not be written out. Try again in a moment.");
        setWordings(body.data.versions);
        if (intent === "revert") {
          setDeclined(true);
          setFixNote("Discarded. This is the wording in your notes.");
        } else {
          setFixNote(intent === "report" ? "Rewritten with what you said was missing." : "");
          setReporting(false);
          setView((current) => (current === "notes" ? "full" : current));
        }
      } catch (error) {
        if (mounted.current) setFixError(error instanceof Error ? error.message : "The question could not be written out. Try again in a moment.");
      } finally {
        if (mounted.current) setFixing(false);
      }
    },
    [cardId]
  );

  // Questions are shown in full by default: one that only exists in the notes' short wording
  // is written out as soon as it is opened. Not when the student chose their notes' wording or
  // discarded the AI's, and not again after a failure (the button below retries).
  useEffect(() => {
    if (textbook || wordings || view === "notes" || declined || askedFor.current) return;
    askedFor.current = true;
    void send("complete");
  }, [declined, send, textbook, view, wordings]);

  const shown = textbook || !wordings || view === "notes" ? (textbook ? statement : noteText) : view === "condensed" ? wordings.condensed ?? wordings.full : wordings.full;
  const aiSource = !textbook && wordings && view !== "notes" ? (view === "condensed" && wordings.condensed ? "Condensed by AI to what you need to solve it" : "Written out in full by AI from the worked solution in your notes") : null;
  const openedAt = useRef(0);

  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  const mark = async (correct: boolean) => {
    setSaving(true);
    setSaveFailed(false);
    const saved = await logAttempt({ cardId, mode: "problem", correct, hintUsed: showFormula, responseMs: Date.now() - openedAt.current });
    setSaving(false);
    if (!saved) return setSaveFailed(true);
    setMarked(correct ? "got" : "missed");
    router.refresh();
  };

  const result = marked ?? lastResult;

  return (
    <div>
      {original?.uncertain && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This wording was matched by problem number, and it reads very differently from your notes. Check it is the same problem; your notes’ version is just below.
        </p>
      )}
      {!textbook && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <QuestionStylePicker key={view} style={view} condensedAvailable={Boolean(wordings?.condensed)} onChange={setView} />
          <button type="button" aria-expanded={reporting} aria-controls="report-missing" onClick={() => setReporting((open) => !open)}
            className={`rounded-xl border px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${reporting ? "border-amber-400 bg-amber-50 text-amber-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
            Something missing?
          </button>
        </div>
      )}

      {!textbook && reporting && (
        <form
          id="report-missing"
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const feedback = String(new FormData(event.currentTarget).get("feedback") ?? "").trim();
            if (feedback.length >= 3) void send("report", feedback);
          }}
        >
          <label htmlFor="missing-feedback" className="block text-sm font-semibold text-amber-900">What is missing or wrong in this question?</label>
          <textarea id="missing-feedback" name="feedback" rows={2} minLength={3} maxLength={600} required placeholder="e.g. It never says how many years, or which cases to compare."
            className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={fixing} className={SMALL}>{fixing ? "Rewriting… (up to a couple of minutes)" : "Tell the AI and rewrite"}</button>
            <span className="text-xs text-amber-900/80">Sends your note, the question and its solution to {providerLabel}. Your vault is not changed.</span>
          </div>
        </form>
      )}

      <div className="text-lg text-slate-900 leading-relaxed mb-3"><Lines text={shown} /></div>

      {textbook && original && (
        <div className="mb-6">
          <p className="text-xs text-slate-500 mb-2">{original.source}</p>
          <details open={original.uncertain} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <summary className="cursor-pointer select-none font-semibold text-slate-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">The short version in your notes</summary>
            <div className="mt-2"><Lines text={original.noteVersion} /></div>
          </details>
        </div>
      )}

      {!textbook && (
        <div className="mb-6 text-sm">
          {aiSource && <p className="text-xs text-slate-500">{aiSource}. AI-written: if it looks wrong, use “Something missing?” or switch to your notes’ wording.</p>}
          {/* Fixed height, so the page does not jump when the full wording arrives. */}
          <p role="status" className="min-h-5 text-slate-600">
            {fixing && !wordings ? "Writing this question out in full… (up to a couple of minutes). Until then this is the short wording from your notes." : fixNote}
          </p>
          {!wordings && issues.length > 0 && (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
              <p className="font-semibold">As written in your notes, this question cannot be answered.</p>
              <ul className="mt-1 list-disc pl-5">
                {issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            </div>
          )}
          {fixError && <p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">{fixError}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {!wordings && !fixing && (fixError || declined || view === "notes") && (
              <button type="button" className={SMALL} onClick={() => { setDeclined(false); void send("complete"); }}>{fixError ? "Try writing it out again" : "Write it out in full (AI)"}</button>
            )}
            {wordings && (
              <>
                <button type="button" disabled={fixing} className={SMALL} onClick={() => void send("complete")}>{fixing ? "Working…" : "Write it out again"}</button>
                <button type="button" disabled={fixing} className={SMALL} onClick={() => void send("revert")}>Discard the AI wording</button>
              </>
            )}
          </div>
        </div>
      )}

      <p className="text-sm text-slate-500 mb-3">Work it out on paper first. Then check.</p>
      <div className="flex flex-wrap gap-2 mb-5">
        {formula && (
          <button type="button" className={SECONDARY} aria-expanded={showFormula} onClick={() => setShowFormula((v) => !v)}>
            {showFormula ? "Hide formula hint" : "Show formula hint"}
          </button>
        )}
        <button type="button" className={showSolution ? SECONDARY : PRIMARY} aria-expanded={showSolution} onClick={() => setShowSolution((v) => !v)}>
          {showSolution ? "Hide solution" : "Show solution"}
        </button>
      </div>

      {showFormula && formula && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-800 mb-1">Formula required</p>
          <div className="text-slate-900"><Lines text={formula} /></div>
        </div>
      )}

      {showSolution && (
        <div aria-live="polite">
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 mb-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">Solution</p>
            <div className="text-slate-900"><Lines text={solution} /></div>
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Did you get it on your own?</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={SECONDARY} disabled={saving} onClick={() => mark(false)}>Missed it</button>
            <button type="button" className={PRIMARY} disabled={saving} onClick={() => mark(true)}>Got it</button>
            {marked && nextHref && (
              <Link href={nextHref} className="ml-1 text-sm font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">
                Next problem →
              </Link>
            )}
          </div>
        </div>
      )}

      <p role="status" className="mt-4 text-sm text-slate-600 min-h-5">
        {saveFailed
          ? "That could not be saved. Check Study Coach is still running and try again."
          : marked
            ? `Saved as “${marked === "got" ? "Got it" : "Missed"}”. It is scheduled to come back in your study sessions.`
            : result !== "new"
              ? `Last time: ${result === "got" ? "got it" : "missed"}.`
              : ""}
      </p>
    </div>
  );
}
