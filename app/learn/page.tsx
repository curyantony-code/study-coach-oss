"use client";
import { useState, useEffect, useCallback } from "react";
import MathText from "@/components/MathText";
import type { Flashcard } from "@/lib/flashcards";
import { useCourse } from "@/lib/use-course";
import { recordAnswer, loadProgress } from "@/lib/progress";
import Link from "next/link";
import Confetti from "@/components/Confetti";
import ProgressDots from "@/components/ProgressDots";

type Phase = "config" | "study" | "done";

export default function LearnPage() {
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [mastered, setMastered] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<Flashcard | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [phase, setPhase] = useState<Phase>("config");
  const [loading, setLoading] = useState(true);
  const [filterWeek, setFilterWeek] = useState("all");
  const [sessionStart, setSessionStart] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    fetch("/api/flashcards")
      .then((r) => r.json())
      .then((cards) => { setAllCards(cards); setLoading(false); });
  }, []);

  useEffect(() => {
    if (phase !== "study") return;
    const t = setInterval(() => setElapsed(Date.now() - sessionStart), 1000);
    return () => clearInterval(t);
  }, [phase, sessionStart]);

  const course = useCourse();
  const weeks = course.inCourseOrder([...new Set(allCards.map((c) => c.week).filter(Boolean))] as string[]);

  const startSession = () => {
    const progress = loadProgress();
    let cards = filterWeek === "all" ? allCards : allCards.filter((c) => c.week === filterWeek);
    // Sort: unmastered first, then by incorrect count desc
    cards = [...cards].sort((a, b) => {
      const pa = progress.get(a.id);
      const pb = progress.get(b.id);
      if (pa?.mastered && !pb?.mastered) return 1;
      if (!pa?.mastered && pb?.mastered) return -1;
      return (pb?.incorrect || 0) - (pa?.incorrect || 0);
    });
    setQueue(cards);
    setCurrent(cards[0] ?? null);
    setMastered(new Set());
    setRevealed(false);
    setStreak(0);
    setSessionStart(Date.now());
    setElapsed(0);
    setPhase("study");
  };

  const handleAnswer = useCallback((knew: boolean) => {
    if (!current) return;
    recordAnswer(current.id, knew, "learn");
    if (knew) {
      const next = new Set(mastered);
      next.add(current.id);
      setMastered(next);
      setStreak((s) => s + 1);
      const remaining = queue.filter((c) => !next.has(c.id));
      if (remaining.length === 0) { setPhase("done"); return; }
      setCurrent(remaining[0]);
    } else {
      setStreak(0);
      // Put card at the back of remaining queue
      const remaining = queue.filter((c) => !mastered.has(c.id) && c.id !== current.id);
      remaining.push(current);
      setQueue([...queue.filter((c) => mastered.has(c.id) || c.id === current.id), ...remaining]);
      setCurrent(remaining[0] ?? null);
    }
    setRevealed(false);
  }, [current, mastered, queue]);

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  if (loading) return <div className="text-center py-20 text-slate-400">Loading…</div>;

  if (phase === "config") {
    const total = filterWeek === "all" ? allCards.length : allCards.filter((c) => c.week === filterWeek).length;
    return (
      <div className="max-w-lg mx-auto animate-fade-in">
        <h1 className="text-3xl font-extrabold gradient-text mb-2">Learn Mode</h1>
        <p className="text-slate-500 mb-8">Cards you miss come back until you master them all.</p>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Filter by unit</label>
            <select value={filterWeek} onChange={(e) => setFilterWeek(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="all">All units ({allCards.length} cards)</option>
              {weeks.map((w) => (
                <option key={w} value={w}>{course.unitLabel(w)} ({allCards.filter((c) => c.week === w).length} cards)</option>
              ))}
            </select>
          </div>
          <button onClick={startSession}
            className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-500 to-indigo-600 hover:opacity-90 transition-opacity shadow-sm">
            Start Learning ({total} cards)
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const total = filterWeek === "all" ? allCards.length : allCards.filter((c) => c.week === filterWeek).length;
    return (
      <div className="max-w-lg mx-auto text-center animate-fade-in">
        <Confetti trigger={true} origin={{ x: 0.5, y: 0.3 }} />
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-3xl font-extrabold gradient-text mb-2">All mastered!</h1>
        <p className="text-slate-500 mb-6">{total} cards · {fmt(elapsed)}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => setPhase("config")}
            className="px-6 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-500 to-indigo-600 hover:opacity-90">
            Study Again
          </button>
          <Link href="/" className="px-6 py-2.5 rounded-xl font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">
            Home
          </Link>
        </div>
      </div>
    );
  }

  if (!current) return null;
  const total = filterWeek === "all" ? allCards.length : allCards.filter((c) => c.week === filterWeek).length;

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Learn Mode</h1>
          <p className="text-sm text-slate-400">{mastered.size}/{total} mastered · {fmt(elapsed)}</p>
        </div>
        <div className="text-right">
          {streak > 1 && (
            <div className="text-sm font-semibold text-orange-500">🔥 {streak} streak</div>
          )}
          <div className="text-sm text-slate-400">{course.unitLabel(current.week)}</div>
        </div>
      </div>

      {/* Progress dots */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <ProgressDots total={total} current={mastered.size} />
        <div className="text-xs text-slate-400">{mastered.size}/{total} mastered</div>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm min-h-64 flex flex-col justify-between p-8 mb-6">
        <div className="flex justify-between items-start text-xs text-slate-400">
          <span className="px-2 py-0.5 bg-slate-100 rounded-full">{current.type}</span>
          <span>{current.tags.slice(0, 2).join(", ")}</span>
        </div>
        <div className="text-center">
          <p className="text-lg font-medium text-slate-800 leading-relaxed"><MathText text={current.front} /></p>
          {revealed && (
            <div className="mt-6 pt-6 border-t border-slate-100 animate-fade-in">
              <p className="text-base text-slate-600 leading-relaxed"><MathText text={current.back} /></p>
            </div>
          )}
        </div>
        {!revealed ? (
          <button onClick={() => setRevealed(true)}
            className="w-full py-2.5 rounded-xl border-2 border-indigo-200 text-indigo-600 font-medium hover:bg-indigo-50 transition-colors text-sm">
            Show Answer
          </button>
        ) : (
          <div className="flex gap-3">
            <button onClick={() => handleAnswer(false)}
              className="flex-1 py-2.5 rounded-xl border-2 border-red-200 text-red-600 font-semibold hover:bg-red-50 transition-colors">
              ✗ Still Learning
            </button>
            <button onClick={() => handleAnswer(true)}
              className="flex-1 py-2.5 rounded-xl border-2 border-emerald-200 text-emerald-600 font-semibold hover:bg-emerald-50 transition-colors">
              ✓ Got It
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
