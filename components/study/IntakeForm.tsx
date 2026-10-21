"use client";
import { useActionState } from "react";
import { saveIntakeAction, type IntakeState } from "@/app/intake/actions";
import type { Profile } from "@/lib/learner/profile";

type Choice = readonly [value: string, label: string];

const QUESTIONS: { name: keyof Profile; legend: string; multiple?: boolean; choices: readonly Choice[] }[] = [
  { name: "prior", legend: "How well do you already know this course?", choices: [["new", "Brand new"], ["some", "Some background"], ["strong", "I know it fairly well"]] },
  { name: "methods", legend: "How do you study today? (tick all that apply)", multiple: true, choices: [["reread", "Reread notes or textbook"], ["highlight", "Highlight"], ["summarize", "Rewrite or summarize"], ["flashcards", "Flashcards"], ["practice", "Practice questions / past exams"], ["teach", "Explain it to someone"], ["draw", "Draw diagrams"]] },
  { name: "timing", legend: "When do you usually study for a test?", choices: [["cram", "Mostly the day or two before"], ["week", "Over the week before"], ["spread", "A little every week"]] },
  { name: "length", legend: "How long is a typical study session?", choices: [["short", "Under 20 min"], ["mid", "20–45 min"], ["long", "45–90 min"], ["xl", "Over 90 min"]] },
  { name: "stuck", legend: "When you are stuck, what do you do first?", choices: [["answer", "Look up the answer"], ["reread", "Reread the chapter"], ["ask", "Ask someone"], ["push", "Keep trying on my own"]] },
  { name: "enjoys", legend: "What keeps you going? (tick all that apply)", multiple: true, choices: [["sketch", "Sketching and diagrams"], ["cards", "Sorting physical cards"], ["aloud", "Talking it through out loud"], ["hand", "Writing by hand"], ["move", "Moving or walking while I think"], ["games", "Quizzes and games"], ["examples", "Real-life examples"]] },
  { name: "phone", legend: "Where is your phone while you study?", choices: [["away", "Another room"], ["silent", "Nearby, on silent"], ["on", "Nearby, notifications on"]] },
  { name: "sleep", legend: "How much do you usually sleep before a study day?", choices: [["good", "7+ hours"], ["some", "Sometimes less"], ["allnight", "I often pull all-nighters"]] },
  { name: "bestTime", legend: "When do you think most clearly?", choices: [["morning", "Morning"], ["afternoon", "Afternoon"], ["evening", "Evening"], ["varies", "It varies"]] },
  { name: "selfConfidence", legend: "How well do you think you know the material right now? (1 = not at all, 5 = very well)", choices: [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]] },
];

const INITIAL: IntakeState = {};

export default function IntakeForm({ profile, studentName }: { profile: Profile | null; studentName: string }) {
  const [state, action, pending] = useActionState(saveIntakeAction, INITIAL);
  const isChosen = (name: keyof Profile, value: string) => {
    const saved = profile?.[name];
    return Array.isArray(saved) ? (saved as string[]).includes(value) : saved !== undefined && String(saved) === value;
  };

  return (
    <form action={action} className="space-y-6">
      <div>
        <label htmlFor="intake-name" className="block text-sm font-semibold text-slate-800 mb-1">Your first name (optional)</label>
        <input id="intake-name" name="name" defaultValue={studentName === "Me" ? "" : studentName} maxLength={60} autoComplete="given-name"
          className="w-full max-w-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
      </div>

      {QUESTIONS.map((q) => (
        <fieldset key={q.name} className="border-0 p-0 m-0">
          <legend className="text-sm font-semibold text-slate-800 mb-2">{q.legend}</legend>
          <div className="flex flex-wrap gap-2">
            {q.choices.map(([value, label]) => (
              <label key={value} className="cursor-pointer">
                <input type={q.multiple ? "checkbox" : "radio"} name={q.name} value={value} required={!q.multiple} defaultChecked={isChosen(q.name, value)} className="peer sr-only" />
                <span className="inline-block rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:border-blue-400 peer-checked:border-blue-600 peer-checked:bg-blue-600 peer-checked:text-white peer-checked:font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-blue-500">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="flex items-center gap-3 flex-wrap">
        <button type="submit" disabled={pending} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500">
          {pending ? "Saving…" : profile ? "Update my plan" : "Make my plan"}
        </button>
        {state.saved && <span role="status" className="text-sm font-medium text-emerald-700">Saved. Your plan is at the top of this page.</span>}
      </div>
      {state.error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{state.error}</p>}
    </form>
  );
}
