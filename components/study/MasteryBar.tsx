/** Mastery as a labelled bar. Colour carries meaning (weak → strong) and the number is always shown. */
export function masteryTone(mastery: number | null): { bar: string; text: string; word: string } {
  if (mastery === null) return { bar: "bg-slate-300", text: "text-slate-500", word: "No cards" };
  if (mastery === 0) return { bar: "bg-slate-300", text: "text-slate-500", word: "Not started" };
  if (mastery < 0.4) return { bar: "bg-rose-500", text: "text-rose-700", word: "Weak" };
  if (mastery < 0.7) return { bar: "bg-amber-500", text: "text-amber-700", word: "Getting there" };
  return { bar: "bg-emerald-500", text: "text-emerald-700", word: "Strong" };
}

export default function MasteryBar({ mastery, label }: { mastery: number | null; label: string }) {
  const tone = masteryTone(mastery);
  const percent = mastery === null ? 0 : Math.round(mastery * 100);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`${label}: ${mastery === null ? "no cards" : `${percent}% mastered`}`}>
        <div className={`h-2 rounded-full origin-left ${tone.bar}`} style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-24 text-right shrink-0 ${tone.text}`}>
        {mastery === null ? tone.word : `${percent}% · ${tone.word}`}
      </span>
    </div>
  );
}
