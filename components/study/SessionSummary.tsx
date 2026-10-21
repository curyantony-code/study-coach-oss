import Link from "next/link";
import MathText from "@/components/MathText";

export interface SessionResult {
  cardId: string;
  front: string;
  back: string;
  correct: boolean;
  confidentMiss: boolean;
}

interface Props {
  results: SessionResult[];
  scopeLabel: string;
  onAgain: () => void;
  /** True while the last answers are still being saved. */
  busy?: boolean;
  /** How many times the student left the tab during the session. */
  timesAway?: number;
}

export default function SessionSummary({ results, scopeLabel, onAgain, busy = false, timesAway = 0 }: Props) {
  const right = results.filter((r) => r.correct).length;
  const confidentMisses = results.filter((r) => r.confidentMiss);
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 animate-fade-in">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">{scopeLabel}</p>
      <h2 className="text-2xl font-extrabold text-slate-900 mb-1">Session done</h2>
      <p className="text-slate-600 mb-6">
        <span className="text-4xl font-extrabold text-slate-900 tabular-nums">{right}</span>
        <span className="text-lg"> of {results.length} right first time.</span>
      </p>

      {confidentMisses.length > 0 && (
        <section aria-labelledby="confident-misses" className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <h3 id="confident-misses" className="text-sm font-bold text-rose-900 mb-1">You were certain, but these were wrong</h3>
          <p className="text-sm text-rose-800 mb-3">These are the most useful ones to fix, so they come back first next time.</p>
          <ul className="space-y-2">
            {confidentMisses.map((r) => (
              <li key={r.cardId} className="text-sm">
                <span className="font-semibold text-slate-900"><MathText text={r.front} /></span>
                <span className="block text-slate-700"><MathText text={r.back} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {timesAway > 0 && (
        <p className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          You left this tab {timesAway} time{timesAway === 1 ? "" : "s"} during the session. Switching away costs more recall than it feels like; next time, try the phone in another room.
        </p>
      )}

      <p className="text-sm text-slate-600 mb-6">
        Each card is now scheduled for when you are about to forget it. Coming back on another day does more than repeating now.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/progress" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500">
          See my progress
        </Link>
        <button type="button" onClick={onAgain} disabled={busy} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          {busy ? "Saving…" : "Another round"}
        </button>
        <Link href="/study" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          Change what I study
        </Link>
      </div>
    </div>
  );
}
