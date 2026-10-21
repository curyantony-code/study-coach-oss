"use client";
import { useActionState } from "react";
import { readOutlineAction, type ScheduleState } from "@/app/schedule/actions";

const INITIAL: ScheduleState = {};
const FIELD = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const PRIMARY = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";

/** Step 1: point Study Coach at the course outline. */
export default function ReadOutlineForm({ pdfs, year }: { pdfs: string[]; year: number }) {
  const [state, action, pending] = useActionState(readOutlineAction, INITIAL);
  return (
    <form action={action} className="space-y-4">
      {pdfs.length > 0 ? (
        <div>
          <label htmlFor="outline-file" className="block text-sm font-semibold text-slate-800 mb-1">Your course outline</label>
          <select id="outline-file" name="file" defaultValue={pdfs[0]} className={FIELD}>
            {pdfs.map((pdf) => <option key={pdf} value={pdf}>{pdf}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">PDFs found in this vault. The file is only read; nothing is written to your vault.</p>
        </div>
      ) : (
        <p className="text-sm text-slate-600">No PDFs were found in this vault, so paste the schedule below.</p>
      )}

      <div>
        <label htmlFor="outline-year" className="block text-sm font-semibold text-slate-800 mb-1">Year the term starts</label>
        <input id="outline-year" name="year" type="number" min={2000} max={2100} defaultValue={year} className={`${FIELD} max-w-32`} />
        <p className="mt-1 text-xs text-slate-500">Outlines usually print “Sept 10” without the year.</p>
      </div>

      <details open={pdfs.length === 0} className="rounded-xl border border-slate-200 px-3 py-2">
        <summary className="cursor-pointer select-none text-sm font-semibold text-slate-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          Or paste the schedule instead
        </summary>
        <label htmlFor="outline-pasted" className="sr-only">Pasted schedule</label>
        <textarea id="outline-pasted" name="pasted" rows={8} placeholder={"Paste the week-by-week part of the outline, e.g.\nWeek 1   Sept 10   Topic 1: Risk and return (ch. 5)\nWeek 2   Sept 17   Topic 2: Portfolio selection (ch. 7)"}
          className={`${FIELD} mt-2 font-mono text-xs`} />
        <p className="mt-1 text-xs text-slate-500">If you paste something here, it is used instead of the PDF.</p>
      </details>

      {state.error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{state.error}</p>}
      <button type="submit" disabled={pending} className={PRIMARY}>{pending ? "Reading…" : "Read the schedule"}</button>
    </form>
  );
}
