"use client";
import { useState, useEffect, useRef } from "react";
import MathText from "@/components/MathText";
import type { Flashcard } from "@/lib/flashcards";
import { useCourse } from "@/lib/use-course";
import { recordAnswer } from "@/lib/progress";
import Link from "next/link";

type Verdict = "correct" | "almost" | "incorrect" | null;
type Phase = "config" | "study" | "done";

function fuzzyMatch(userInput: string, answer: string): Verdict {
  const clean = (s: string) => s.toLowerCase().replace(/[*_`~\[\]()]/g, "").replace(/\s+/g, " ").trim();
  const u = clean(userInput);
  const a = clean(answer);
  if (!u) return null;
  if (u === a || a.includes(u) || u.includes(a)) return "correct";
  // Extract key terms (words > 4 chars) from answer
  const terms = a.split(/\s+/).filter((w) => w.length > 4 && !/^(that|this|with|from|when|where|which|their|there|about|would|could|should|have|been)$/.test(w));
  const matched = terms.filter((t) => u.includes(t));
  if (matched.length >= Math.ceil(terms.length * 0.5) && terms.length > 0) return "almost";
  return "incorrect";
}

const VERDICT_STYLES = {
  correct:   { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "✓ Correct!" },
  almost:    { bg: "bg-amber-50 border-amber-200",     text: "text-amber-700",   label: "~ Almost!" },
  incorrect: { bg: "bg-red-50 border-red-200",         text: "text-red-700",     label: "✗ Incorrect" },
};

export default function WritePage() {
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [phase, setPhase] = useState<Phase>("config");
  const [filterWeek, setFilterWeek] = useState("all");
  const [score, setScore] = useState({ correct: 0, almost: 0, incorrect: 0 });
  const [loading, setLoading] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/flashcards").then((r) => r.json()).then((c) => { setAllCards(c); setLoading(false); });
  }, []);

  const course = useCourse();
  const weeks = course.inCourseOrder([...new Set(allCards.map((c) => c.week).filter(Boolean))] as string[]);

  const start = () => {
    const filtered = filterWeek === "all" ? allCards : allCards.filter((c) => c.week === filterWeek);
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setIndex(0);
    setInput("");
    setVerdict(null);
    setScore({ correct: 0, almost: 0, incorrect: 0 });
    setPhase("study");
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const submit = () => {
    if (!input.trim() || verdict) return;
    const card = cards[index];
    const v = fuzzyMatch(input, card.back);
    if (!v) return;
    setVerdict(v);
    recordAnswer(card.id, v === "correct" || v === "almost", "write");
    setScore((s) => ({ ...s, [v]: s[v] + 1 }));
  };

  const next = () => {
    if (index + 1 >= cards.length) { setPhase("done"); return; }
    setIndex((i) => i + 1);
    setInput("");
    setVerdict(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const override = () => {
    if (!verdict || verdict === "correct") return;
    setScore((s) => ({ ...s, [verdict]: s[verdict] - 1, correct: s.correct + 1 }));
    setVerdict("correct");
  };

  if (loading) return <div className="text-center py-20 text-slate-400">Loading…</div>;

  if (phase === "config") {
    return (
      <div className="max-w-lg mx-auto animate-fade-in">
        <h1 className="text-3xl font-extrabold gradient-text mb-2">Write Mode</h1>
        <p className="text-slate-500 mb-8">Type the answer from memory. Partial credit for key terms.</p>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Filter by unit</label>
            <select value={filterWeek} onChange={(e) => setFilterWeek(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400">
              <option value="all">All units</option>
              {weeks.map((w) => <option key={w} value={w}>{course.unitLabel(w)}</option>)}
            </select>
          </div>
          <button onClick={start}
            className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 transition-opacity shadow-sm">
            Start Writing
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const total = score.correct + score.almost + score.incorrect;
    const pct = Math.round(((score.correct + score.almost * 0.5) / total) * 100);
    return (
      <div className="max-w-lg mx-auto text-center animate-fade-in">
        <div className="text-5xl mb-4">✍️</div>
        <h1 className="text-3xl font-extrabold gradient-text mb-6">Session Complete</h1>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
          <div className="text-5xl font-bold text-slate-800 mb-1">{pct}%</div>
          <div className="text-slate-400 text-sm mb-5">overall score</div>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="bg-emerald-50 rounded-xl p-3"><div className="text-2xl font-bold text-emerald-600">{score.correct}</div><div className="text-emerald-700">Correct</div></div>
            <div className="bg-amber-50 rounded-xl p-3"><div className="text-2xl font-bold text-amber-600">{score.almost}</div><div className="text-amber-700">Almost</div></div>
            <div className="bg-red-50 rounded-xl p-3"><div className="text-2xl font-bold text-red-600">{score.incorrect}</div><div className="text-red-700">Missed</div></div>
          </div>
        </div>
        <div className="flex gap-3 justify-center">
          <button onClick={() => setPhase("config")} className="px-6 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90">Try Again</button>
          <Link href="/" className="px-6 py-2.5 rounded-xl font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Home</Link>
        </div>
      </div>
    );
  }

  const card = cards[index];
  const pct = Math.round((index / cards.length) * 100);

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-800">Write Mode</h1>
        <span className="text-sm text-slate-400">{index + 1} / {cards.length}</span>
      </div>

      <div className="w-full bg-slate-100 rounded-full h-2 mb-8">
        <div className="progress-bar h-2" style={{ width: `${pct}%` }} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 mb-4">
        <div className="text-xs text-slate-400 mb-4 flex gap-2">
          <span className="px-2 py-0.5 bg-slate-100 rounded-full">{card.type}</span>
          {card.week && <span className="px-2 py-0.5 bg-slate-100 rounded-full">{course.unitLabel(card.week)}</span>}
        </div>
        <p className="text-lg font-semibold text-slate-800 mb-6 leading-relaxed"><MathText text={card.front} /></p>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          disabled={!!verdict}
          placeholder="Type your answer… (Enter to submit)"
          rows={3}
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
        />

        {verdict && (
          <div className={`mt-4 p-4 rounded-xl border animate-fade-in ${VERDICT_STYLES[verdict].bg}`}>
            <p className={`font-semibold text-sm mb-1 ${VERDICT_STYLES[verdict].text}`}>{VERDICT_STYLES[verdict].label}</p>
            <p className="text-sm text-slate-700"><span className="font-medium">Answer: </span><MathText text={card.back} /></p>
            {verdict !== "correct" && (
              <button onClick={override} className="mt-2 text-xs text-slate-500 underline hover:text-slate-700">
                Mark as correct anyway
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        {!verdict ? (
          <button onClick={submit} disabled={!input.trim()}
            className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 disabled:opacity-40 transition-opacity">
            Submit Answer
          </button>
        ) : (
          <button onClick={next}
            className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90">
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
