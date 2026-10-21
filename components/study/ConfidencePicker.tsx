"use client";
import type { Confidence } from "@/lib/learner/types";

const OPTIONS: { value: Confidence; label: string; key: string }[] = [
  { value: "guessing", label: "Guessing", key: "1" },
  { value: "fairly-sure", label: "Fairly sure", key: "2" },
  { value: "certain", label: "Certain", key: "3" },
];

export const CONFIDENCE_KEYS: Record<string, Confidence> = Object.fromEntries(OPTIONS.map((o) => [o.key, o.value]));

interface Props {
  value: Confidence | null;
  onChange: (value: Confidence) => void;
  disabled?: boolean;
}

export default function ConfidencePicker({ value, onChange, disabled = false }: Props) {
  return (
    <fieldset disabled={disabled} className="border-0 p-0 m-0">
      <legend className="text-sm font-semibold text-slate-700 mb-2">Before you see the answer: how sure are you?</legend>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`rounded-xl border-2 px-2 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 disabled:opacity-60 ${
                selected
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50 active:bg-blue-100"
              }`}
            >
              {option.label}
              <kbd className={`ml-1.5 hidden sm:inline text-xs font-mono ${selected ? "text-blue-100" : "text-slate-400"}`}>{option.key}</kbd>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
