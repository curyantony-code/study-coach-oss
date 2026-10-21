"use client";
import { useState, useEffect, useRef } from "react";
import MathText from "@/components/MathText";
import { truncateKeepingMath } from "@/lib/mathtext";
import { logAttempt } from "@/lib/study-client";
import type { Flashcard } from "@/lib/flashcards";
import { useCourse } from "@/lib/use-course";
import { saveMatchBest, getMatchBest } from "@/lib/progress";
import Confetti from "@/components/Confetti";

type Phase = "config" | "playing" | "done";

interface Tile {
  id: string;
  text: string;
  pairId: string;
  side: "front" | "back";
  matched: boolean;
  shake: boolean;
}

const PAIR_COLORS = [
  "border-violet-300 bg-violet-50 text-violet-800",
  "border-blue-300 bg-blue-50 text-blue-800",
  "border-emerald-300 bg-emerald-50 text-emerald-800",
  "border-orange-300 bg-orange-50 text-orange-800",
  "border-rose-300 bg-rose-50 text-rose-800",
  "border-cyan-300 bg-cyan-50 text-cyan-800",
  "border-amber-300 bg-amber-50 text-amber-800",
  "border-pink-300 bg-pink-50 text-pink-800",
  "border-teal-300 bg-teal-50 text-teal-800",
  "border-indigo-300 bg-indigo-50 text-indigo-800",
];

const MATCHED_COLORS = [
  "border-violet-400 bg-violet-100 text-violet-900 opacity-60",
  "border-blue-400 bg-blue-100 text-blue-900 opacity-60",
  "border-emerald-400 bg-emerald-100 text-emerald-900 opacity-60",
  "border-orange-400 bg-orange-100 text-orange-900 opacity-60",
  "border-rose-400 bg-rose-100 text-rose-900 opacity-60",
  "border-cyan-400 bg-cyan-100 text-cyan-900 opacity-60",
  "border-amber-400 bg-amber-100 text-amber-900 opacity-60",
  "border-pink-400 bg-pink-100 text-pink-900 opacity-60",
  "border-teal-400 bg-teal-100 text-teal-900 opacity-60",
  "border-indigo-400 bg-indigo-100 text-indigo-900 opacity-60",
];

export default function MatchPage() {
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("config");
  const [pairCount, setPairCount] = useState(6);
  const [filterWeek, setFilterWeek] = useState("all");
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [errors, setErrors] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [bestTime, setBestTime] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/flashcards").then((r) => r.json()).then((c) => { setAllCards(c); setLoading(false); });
  }, []);

  useEffect(() => {
    if (phase === "playing") {
      timerRef.current = setInterval(() => setElapsed(Date.now() - startTime), 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, startTime]);

  const course = useCourse();
  const weeks = course.inCourseOrder([...new Set(allCards.map((c) => c.week).filter(Boolean))] as string[]);

  const startGame = () => {
    const pool = filterWeek === "all" ? allCards : allCards.filter((c) => c.week === filterWeek);
    const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, pairCount);
    const t: Tile[] = [];
    picked.forEach((card) => {
      t.push({ id: `${card.id}-front`, text: card.front, pairId: card.id, side: "front", matched: false, shake: false });
      t.push({ id: `${card.id}-back`,  text: card.back,  pairId: card.id, side: "back",  matched: false, shake: false });
    });
    setBestTime(getMatchBest(filterWeek));
    setTiles(t.sort(() => Math.random() - 0.5));
    setSelected(null);
    setErrors(0);
    setMatchedCount(0);
    setStartTime(Date.now());
    setElapsed(0);
    setPhase("playing");
  };

  const handleTile = (tileId: string) => {
    const tile = tiles.find((t) => t.id === tileId);
    if (!tile || tile.matched) return;
    if (tileId === selected) { setSelected(null); return; }

    if (!selected) {
      setSelected(tileId);
      return;
    }

    const selTile = tiles.find((t) => t.id === selected)!;
    if (selTile.pairId === tile.pairId && selTile.side !== tile.side) {
      // Match!
      logAttempt({ cardId: tile.pairId, mode: "match", correct: true });
      const next = matchedCount + 1;
      setTiles((prev) => prev.map((t) =>
        t.id === tileId || t.id === selected ? { ...t, matched: true } : t
      ));
      setMatchedCount(next);
      setSelected(null);
      if (next === pairCount) {
        // Runs when a tile is clicked, never while drawing the page.
        // eslint-disable-next-line react-hooks/purity
        const finalTime = Date.now() - startTime;
        saveMatchBest(filterWeek, finalTime);
        setElapsed(finalTime);
        setPhase("done");
      }
    } else {
      // Wrong
      logAttempt({ cardId: selTile.pairId, mode: "match", correct: false });
      setErrors((e) => e + 1);
      setTiles((prev) => prev.map((t) =>
        t.id === tileId || t.id === selected ? { ...t, shake: true } : t
      ));
      setTimeout(() => {
        setTiles((prev) => prev.map((t) => ({ ...t, shake: false })));
        setSelected(null);
      }, 400);
    }
  };

  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  // Assign color index per pairId
  const pairColorMap = new Map<string, number>();
  tiles.forEach((t) => {
    if (!pairColorMap.has(t.pairId)) pairColorMap.set(t.pairId, pairColorMap.size % PAIR_COLORS.length);
  });

  if (loading) return <div className="text-center py-20 text-slate-400">Loading…</div>;

  if (phase === "config") {
    return (
      <div className="max-w-lg mx-auto animate-fade-in">
        <h1 className="text-3xl font-extrabold gradient-text mb-2">Match Game</h1>
        <p className="text-slate-500 mb-8">Match terms to definitions as fast as you can.</p>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Unit</label>
            <select value={filterWeek} onChange={(e) => setFilterWeek(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
              <option value="all">All units</option>
              {weeks.map((w) => <option key={w} value={w}>{course.unitLabel(w)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Number of pairs</label>
            <div className="flex gap-2">
              {[4, 6, 8, 10].map((n) => (
                <button key={n} onClick={() => setPairCount(n)}
                  className={`flex-1 py-2 rounded-xl border-2 text-sm font-semibold transition-colors ${pairCount === n ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button onClick={startGame}
            className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:opacity-90 transition-opacity shadow-sm">
            Start Game
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const isRecord = bestTime === null || elapsed <= bestTime;
    return (
      <div className="max-w-md mx-auto text-center animate-fade-in">
        <Confetti trigger={true} origin={{ x: 0.5, y: 0.3 }} />
        <div className="text-5xl mb-3">🎯</div>
        <h1 className="text-3xl font-extrabold gradient-text mb-1">Matched!</h1>
        {isRecord && <p className="text-orange-500 font-semibold mb-4">🏆 New best time!</p>}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 grid grid-cols-2 gap-4">
          <div className="bg-emerald-50 rounded-xl p-3"><div className="text-2xl font-bold text-emerald-600">{fmt(elapsed)}</div><div className="text-sm text-emerald-700">Time</div></div>
          <div className="bg-red-50 rounded-xl p-3"><div className="text-2xl font-bold text-red-600">{errors}</div><div className="text-sm text-red-700">Errors</div></div>
        </div>
        <div className="flex gap-3 justify-center">
          <button onClick={startGame} className="px-6 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:opacity-90">Play Again</button>
          <button onClick={() => setPhase("config")} className="px-6 py-2.5 rounded-xl font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Settings</button>
        </div>
      </div>
    );
  }

  const cols = pairCount <= 6 ? 3 : 4;

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">Match Game</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">{matchedCount}/{pairCount} matched</span>
          {errors > 0 && <span className="text-red-500">{errors} errors</span>}
          <span className="font-mono font-semibold text-slate-700">{fmt(elapsed)}</span>
        </div>
      </div>

      <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {tiles.map((tile) => {
          const colorIdx = pairColorMap.get(tile.pairId) ?? 0;
          const isSelected = selected === tile.id;
          const cls = tile.matched
            ? MATCHED_COLORS[colorIdx]
            : isSelected
            ? "border-indigo-400 bg-indigo-50 text-indigo-900 shadow-md scale-[1.02]"
            : `${PAIR_COLORS[colorIdx]} hover:shadow-md hover:scale-[1.01] cursor-pointer`;
          return (
            <button
              key={tile.id}
              onClick={() => !tile.matched && handleTile(tile.id)}
              disabled={tile.matched}
              className={`border-2 rounded-xl p-3 text-sm font-medium text-left transition-all duration-150 min-h-16 flex items-center ${cls} ${tile.shake ? "animate-shake" : ""}`}
            >
              <MathText text={truncateKeepingMath(tile.text, 80)} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
