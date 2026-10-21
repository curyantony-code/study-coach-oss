"use client";
import { useState } from "react";
import type { QuestionStyle } from "@/lib/problems/fixes";

const LABEL: Record<QuestionStyle, string> = { full: "In full", condensed: "Condensed", notes: "As in my notes" };
const HINT: Record<QuestionStyle, string> = {
  full: "Every given and exactly what to find, in full sentences.",
  condensed: "Only the givens and what to find.",
  notes: "The wording exactly as your notes have it.",
};

/** Remembers the choice in the app, in the background: nothing on the page waits for it. */
function remember(style: QuestionStyle): void {
  void fetch("/api/problems/style", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ style }) }).catch(() => undefined);
}

interface Props {
  style: QuestionStyle;
  condensedAvailable?: boolean;
  /** Called at once with the new choice, so the page can change its wording without reloading. */
  onChange?: (style: QuestionStyle) => void;
}

/** Chooses the wording of questions everywhere: problems, study sessions and quizzes. */
export default function QuestionStylePicker({ style, condensedAvailable = true, onChange }: Props) {
  const [chosen, setChosen] = useState(style);
  const pick = (option: QuestionStyle) => {
    if (option === chosen) return;
    setChosen(option);
    onChange?.(option);
    remember(option);
  };
  return (
    <div role="group" aria-label="How questions are worded" className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
      {(Object.keys(LABEL) as QuestionStyle[]).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={chosen === option}
          disabled={option === "condensed" && !condensedAvailable && chosen !== "condensed"}
          title={option === "condensed" && !condensedAvailable ? "No condensed version of this question yet" : HINT[option]}
          onClick={() => pick(option)}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 ${
            chosen === option ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {LABEL[option]}
        </button>
      ))}
    </div>
  );
}
