"use client";
import { useActionState, useState } from "react";
import { confirmScheduleAction, type ScheduleState } from "@/app/schedule/actions";

const INITIAL: ScheduleState = {};
const FIELD = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const PRIMARY = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
const DAYS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" }, { value: 4, label: "Thu" },
  { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 0, label: "Sun" },
];
const MINUTES = [30, 45, 60, 90, 120];

interface Props {
  lines: string;
  source: string;
  finalDate: string;
  /** True when the date is our guess: a week after the last class. */
  finalAssumed: boolean;
  /** Set when the outline gave an exam period rather than a day, e.g. "2026-12-22". */
  examPeriodEnd: string | null;
  testCount: number;
  studyDays: number[];
  minutesPerDay: number;
}

/** Step 2: check what was read, then the questions the outline cannot answer. */
export default function ConfirmForm({ lines, source, finalDate, finalAssumed, examPeriodEnd, testCount, studyDays, minutesPerDay }: Props) {
  const [state, action, pending] = useActionState(confirmScheduleAction, INITIAL);
  const [date, setDate] = useState(finalDate);
  const uncertain = finalAssumed || examPeriodEnd !== null;

  return (
    <form action={action} className="space-y-8">
      <fieldset>
        <legend className="text-base font-bold text-slate-900">1. Is this your class schedule?</legend>
        <p className="mt-1 mb-2 text-sm text-slate-600">
          Read from <span className="font-medium text-slate-800">{source}</span>. Outlines are untidy, so fix anything that looks wrong: one class per line,
          a date, then <code className="rounded bg-slate-100 px-1">|</code>, then the topic. Delete lines that are not classes or tests.
        </p>
        <label htmlFor="schedule-lines" className="sr-only">Classes and tests, one per line</label>
        <textarea id="schedule-lines" name="lines" defaultValue={lines} rows={Math.min(Math.max(lines.split("\n").length + 1, 8), 22)} spellCheck={false}
          className={`${FIELD} w-full font-mono text-xs leading-relaxed whitespace-pre overflow-x-auto`} />
        <p className="mt-1 text-xs text-slate-500">
          {testCount === 0 ? "No tests were found. " : `${testCount} test${testCount === 1 ? "" : "s"} found (marked TEST). `}
          To add a midterm or quiz, add a line like <code className="rounded bg-slate-100 px-1">2026-10-20 | TEST | Midterm</code>.
        </p>
      </fieldset>

      <fieldset>
        <legend className="text-base font-bold text-slate-900">2. When is the final exam?</legend>
        {uncertain && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {examPeriodEnd
              ? `Your outline only gives the exam period (up to ${examPeriodEnd}). I have used its first day for now.`
              : "Your outline does not give a date, so I have assumed one week after your last class."}{" "}
            Change it when the real date is announced: the last weeks of the plan depend on it.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label htmlFor="final-date" className="text-sm font-semibold text-slate-800">Final exam date</label>
          <input id="final-date" name="finalDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} required className={FIELD} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="finalKnown" value="yes" defaultChecked={!uncertain} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500" />
            This is the confirmed date
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-base font-bold text-slate-900">3. When can you study?</legend>
        <p className="mt-1 mb-3 text-sm text-slate-600">Tasks are only placed on the days you pick, and each day stays within the time you give it.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Days you can study">
          {DAYS.map((day) => (
            <label key={day.value} className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500">
              <input type="checkbox" name="studyDays" value={day.value} defaultChecked={studyDays.includes(day.value)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
              {day.label}
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="minutes-per-day" className="text-sm font-semibold text-slate-800">Time for this course on a study day</label>
          <select id="minutes-per-day" name="minutesPerDay" defaultValue={MINUTES.includes(minutesPerDay) ? minutesPerDay : 60} className={FIELD}>
            {MINUTES.map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : `${m / 60} hours`}</option>)}
          </select>
        </div>
      </fieldset>

      {state.error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{state.error}</p>}
      <button type="submit" disabled={pending} className={PRIMARY}>{pending ? "Building…" : "Build my schedule"}</button>
    </form>
  );
}
