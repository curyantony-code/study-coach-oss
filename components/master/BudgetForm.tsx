"use client";
import { useActionState } from "react";
import { saveBudgetAction, type BudgetState } from "@/app/master/actions";

const DAYS = [["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"], ["0", "Sun"]] as const;
const CHOICES = [60, 90, 120, 150, 180, 210, 240, 300, 360];

function label(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours} h ${rest} min`;
}

/** How much study a day can hold, across every course. The plan for each course follows from it. */
export default function BudgetForm({ minutesPerDay, studyDays, chosen }: { minutesPerDay: number; studyDays: number[]; chosen: boolean }) {
  const [state, action, pending] = useActionState<BudgetState, FormData>(saveBudgetAction, {});
  const choices = CHOICES.includes(minutesPerDay) ? CHOICES : [...CHOICES, minutesPerDay].sort((a, b) => a - b);
  return (
    <form action={action} className="flex flex-wrap items-end gap-x-5 gap-y-3">
      <div>
        <label htmlFor="budget-minutes" className="block text-xs font-semibold text-slate-600 mb-1">Study time on a study day, all courses together</label>
        <select id="budget-minutes" name="minutesPerDay" defaultValue={minutesPerDay} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          {choices.map((minutes) => <option key={minutes} value={minutes}>{label(minutes)}</option>)}
        </select>
      </div>
      <fieldset>
        <legend className="text-xs font-semibold text-slate-600 mb-1">Days you study</legend>
        <div className="flex flex-wrap gap-1">
          {DAYS.map(([value, name]) => (
            <label key={value} className="cursor-pointer">
              <input type="checkbox" name="studyDays" value={value} defaultChecked={studyDays.includes(Number(value))} className="peer sr-only" />
              <span className="block rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 peer-checked:border-blue-600 peer-checked:bg-blue-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2">{name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" disabled={pending} className="rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500">
        {pending ? "Replanning…" : chosen ? "Replan" : "Use this"}
      </button>
      <p role="status" aria-live="polite" className={`basis-full text-sm ${state.error ? "text-rose-700" : "text-emerald-700"}`}>
        {state.error ?? (state.saved ? "Saved. Every course’s plan now follows this." : "")}
      </p>
    </form>
  );
}
