"use client";
import { useState } from "react";

type Sleep = "good" | "ok" | "poor";

const OPTIONS: { value: Sleep; label: string; detail: string }[] = [
  { value: "good", label: "Slept well", detail: "7 hours or more" },
  { value: "ok", label: "So-so", detail: "A bit short" },
  { value: "poor", label: "Badly", detail: "Very short or broken" },
];

/**
 * One tap, once a day. A bad night switches today's sessions to review only, because
 * new material sticks poorly without sleep. `onDone(true)` means the plan changed.
 */
export default function SleepCheckin({ onDone }: { onDone: (planChanged: boolean) => void }) {
  const [saving, setSaving] = useState<Sleep | null>(null);
  const [failed, setFailed] = useState(false);

  const answer = async (sleep: Sleep) => {
    setSaving(sleep);
    setFailed(false);
    try {
      const response = await fetch("/api/study/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sleep }) });
      if (!response.ok) throw new Error("not saved");
      onDone(sleep === "poor");
    } catch {
      setFailed(true);
      setSaving(null);
    }
  };

  return (
    <section aria-labelledby="sleep-checkin" className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 animate-fade-in">
      <h2 id="sleep-checkin" className="text-xl font-bold text-slate-900 mb-1">Quick check: how did you sleep?</h2>
      <p className="text-sm text-slate-500 mb-5">Asked once a day. After a bad night, today’s sessions review what you know instead of starting new material.</p>
      <div className="grid sm:grid-cols-3 gap-2">
        {OPTIONS.map((option) => (
          <button key={option.value} type="button" disabled={saving !== null} onClick={() => answer(option.value)}
            className="rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-left hover:border-blue-400 hover:bg-blue-50 active:bg-blue-100 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500">
            <span className="block text-sm font-semibold text-slate-900">{saving === option.value ? "Saving…" : option.label}</span>
            <span className="block text-xs text-slate-500">{option.detail}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <button type="button" onClick={() => onDone(false)} disabled={saving !== null}
          className="text-sm font-semibold text-slate-600 underline underline-offset-2 hover:text-blue-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          Skip for now
        </button>
        {failed && <span role="alert" className="text-sm text-rose-700">That could not be saved. Try again, or skip.</span>}
      </div>
    </section>
  );
}
