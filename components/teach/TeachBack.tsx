"use client";
import Link from "next/link";
import { useState } from "react";
import MathText from "@/components/MathText";
import type { ApiResponse } from "@/lib/api";
import { MAX_EXPLANATION_LENGTH, MIN_EXPLANATION_LENGTH, scoreBand, SELF_RATINGS } from "@/lib/learner/teachback";

type Result =
  | { graded: true; selfRated: boolean; score: number; covered: string[]; missing: string[]; tip: string }
  | { graded: false; reason: string; keyPoints: string[] };

const PRIMARY = "rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
const SECONDARY = "rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 active:bg-slate-100 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
const BAND = { strong: "text-emerald-700", middling: "text-amber-700", weak: "text-rose-700" } as const;

export default function TeachBack({ nodeId, noteTitle, studyHref, noteHref }: { nodeId: string; noteTitle: string; studyHref: string; noteHref: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (selfRating?: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/teach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodeId, text, selfRating }) });
      const body = (await response.json()) as ApiResponse<Result>;
      if (!body.success || !body.data) throw new Error(body.error ?? "That could not be checked just now.");
      setResult(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That could not be checked just now.");
    } finally {
      setBusy(false);
    }
  };

  const tooShort = text.trim().length < MIN_EXPLANATION_LENGTH;
  const locked = result !== null;

  return (
    <div>
      <label htmlFor="teach-text" className="block text-sm font-semibold text-slate-800 mb-1">Explain “{noteTitle}” as if teaching a classmate who missed the lecture</label>
      <p className="text-sm text-slate-500 mb-2">From memory, in your own words: the main ideas, how they connect, and an example if you can. Do not look at the note.</p>
      <textarea
        id="teach-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        readOnly={locked}
        rows={9}
        maxLength={MAX_EXPLANATION_LENGTH}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 read-only:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      />
      {!locked && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className={PRIMARY} disabled={busy || tooShort} onClick={() => send()}>
            {busy ? "Checking… (this can take half a minute)" : "Check my explanation"}
          </button>
          {tooShort && <span className="text-sm text-slate-500">Write a few sentences first.</span>}
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      <div aria-live="polite">
        {result?.graded === false && (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-base font-bold text-amber-900 mb-1">The AI could not grade this one</h2>
            <p className="text-sm text-amber-900 mb-3">{result.reason} You can still check yourself against what the note covers:</p>
            {result.keyPoints.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1 text-sm text-slate-800 mb-4">
                {result.keyPoints.map((point) => <li key={point}><MathText text={point} /></li>)}
              </ul>
            ) : (
              <p className="text-sm text-slate-700 mb-4">This note has no cards to list. <Link href={noteHref} className="font-semibold underline underline-offset-2">Open the note</Link> and compare.</p>
            )}
            <p className="text-sm font-semibold text-slate-800 mb-2">How many of these did your explanation cover correctly?</p>
            <div className="flex flex-wrap gap-2">
              {SELF_RATINGS.map((rating) => (
                <button key={rating.id} type="button" className={SECONDARY} disabled={busy} onClick={() => send(rating.id)}>{rating.label}</button>
              ))}
            </div>
          </section>
        )}

        {result?.graded && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">{result.selfRated ? "Your own rating" : "AI check against your note"}</p>
            <p className={`text-4xl font-extrabold tabular-nums mb-4 ${BAND[scoreBand(result.score)]}`}>
              {result.score}<span className="text-lg font-semibold text-slate-500"> / 100</span>
            </p>
            {result.covered.length > 0 && (
              <>
                <h3 className="text-sm font-bold text-emerald-800 mb-1">You explained</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-800 mb-4">{result.covered.map((c) => <li key={c}><MathText text={c} /></li>)}</ul>
              </>
            )}
            {result.missing.length > 0 && (
              <>
                <h3 className="text-sm font-bold text-rose-800 mb-1">Missing or not right</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-800 mb-4">{result.missing.map((m) => <li key={m}><MathText text={m} /></li>)}</ul>
              </>
            )}
            {result.tip && <p className="text-sm text-slate-700 mb-4"><span className="font-semibold">Next: </span><MathText text={result.tip} /></p>}
            {!result.selfRated && <p className="text-xs text-slate-500 mb-4">An AI judgement, not a mark. If it seems off, compare with the note yourself.</p>}
            <div className="flex flex-wrap gap-3">
              <Link href={studyHref} className={PRIMARY}>Study this note’s cards</Link>
              <Link href={noteHref} className={SECONDARY}>Open the note</Link>
              <button type="button" className={SECONDARY} onClick={() => { setResult(null); setText(""); }}>Try again from memory</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
