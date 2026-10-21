"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import MathText from "@/components/MathText";
import { logAttempt } from "@/lib/study-client";
import type { Flashcard } from "@/lib/flashcards";
import { vaultStorageKey } from "@/lib/progress";
import { useCourse } from "@/lib/use-course";
import Confetti from "@/components/Confetti";

// ── types ────────────────────────────────────────────────────────────────────

interface Bird {
  y: number;
  vy: number;
}

interface Obstacle {
  x: number;
  gapY: number;   // centre of gap
  card: Flashcard;
  passed: boolean;
  id: number;
}

type GameState = "idle" | "question" | "playing" | "dead" | "done";

// ── constants ────────────────────────────────────────────────────────────────

const W = 640, H = 360;
const BIRD_X = 100, BIRD_R = 16;
const GAP = 110, PIPE_W = 52;
const GRAVITY = 0.55, JUMP = -9;
const SPEED = 3;
const QUESTIONS_TO_WIN = 5;

// ── helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] { return [...arr].sort(() => Math.random() - 0.5); }

function buildOptions(correct: string, pool: Flashcard[], card: Flashcard): string[] {
  const distractors = shuffle(pool.filter((c) => c.id !== card.id))
    .slice(0, 3)
    .map((c) => c.front);
  return shuffle([correct, ...distractors]);
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ArcadePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef  = useRef<GameState>("idle");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [score, setScore]         = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [cards, setCards]         = useState<Flashcard[]>([]);
  const [filterWeek, setFilterWeek] = useState("all");
  const [question, setQuestion]   = useState<{ card: Flashcard; options: string[] } | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const birdRef     = useRef<Bird>({ y: H / 2, vy: 0 });
  const obstaclesRef= useRef<Obstacle[]>([]);
  const scoreRef    = useRef(0);
  const frameRef    = useRef<number>(0);
  const tickRef     = useRef(0);
  const nextIdRef   = useRef(0);
  const poolRef     = useRef<Flashcard[]>([]);

  useEffect(() => {
    fetch("/api/flashcards")
      .then((r) => r.json())
      .then((data) => {
        setCards(data);
        setBestScore(parseInt(localStorage.getItem(vaultStorageKey("study-coach-arcade-best")) || "0", 10));
      });
  }, []);

  const course = useCourse();
  const weeks = course.inCourseOrder([...new Set(cards.map((c) => c.week).filter(Boolean))] as string[]);

  const startGame = useCallback(() => {
    const pool = filterWeek === "all" ? cards : cards.filter((c) => c.week === filterWeek);
    poolRef.current = shuffle(pool);
    birdRef.current = { y: H / 2, vy: 0 };
    obstaclesRef.current = [];
    scoreRef.current = 0;
    tickRef.current = 0;
    nextIdRef.current = 0;
    setScore(0);
    setCelebrate(false);
    stateRef.current = "playing";
    setGameState("playing");
  }, [cards, filterWeek]);

  const jump = useCallback(() => {
    if (stateRef.current !== "playing") return;
    birdRef.current.vy = JUMP;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); jump(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump]);

  // Ask question when bird hits obstacle zone
  const triggerQuestion = useCallback((ob: Obstacle) => {
    stateRef.current = "question";
    setGameState("question");
    const opts = buildOptions(ob.card.front, poolRef.current, ob.card);
    setQuestion({ card: ob.card, options: opts });
  }, []);

  const answerQuestion = useCallback((ans: string) => {
    if (!question) return;
    const correct = ans === question.card.front;
    logAttempt({ cardId: question.card.id, mode: "arcade", correct });
    if (correct) {
      // Remove the obstacle the bird passed through
      obstaclesRef.current = obstaclesRef.current.filter((o) => !o.passed || o.x > BIRD_X + BIRD_R);
      scoreRef.current += 1;
      setScore(scoreRef.current);
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 1000);
      if (scoreRef.current >= QUESTIONS_TO_WIN) {
        stateRef.current = "done";
        setGameState("done");
        const best = parseInt(localStorage.getItem(vaultStorageKey("study-coach-arcade-best")) || "0", 10);
        if (scoreRef.current > best) {
          localStorage.setItem(vaultStorageKey("study-coach-arcade-best"), String(scoreRef.current));
          setBestScore(scoreRef.current);
        }
      } else {
        stateRef.current = "playing";
        setGameState("playing");
      }
    } else {
      stateRef.current = "dead";
      setGameState("dead");
    }
    setQuestion(null);
  }, [question]);

  // Game loop
  useEffect(() => {
    if (gameState !== "playing") { cancelAnimationFrame(frameRef.current); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const loop = () => {
      if (stateRef.current !== "playing") return;
      tickRef.current++;

      // Spawn obstacle
      if (tickRef.current % 120 === 0) {
        const pool = poolRef.current;
        const card = pool[nextIdRef.current % pool.length];
        nextIdRef.current++;
        obstaclesRef.current.push({
          x: W + PIPE_W,
          gapY: 80 + Math.random() * (H - 160),
          card,
          passed: false,
          id: nextIdRef.current,
        });
      }

      // Physics
      const bird = birdRef.current;
      bird.vy += GRAVITY;
      bird.y  += bird.vy;

      // Move obstacles
      obstaclesRef.current = obstaclesRef.current
        .map((o) => ({ ...o, x: o.x - SPEED }))
        .filter((o) => o.x > -PIPE_W - 10);

      // Collision & pass checks
      for (const ob of obstaclesRef.current) {
        const birdInX = BIRD_X + BIRD_R > ob.x && BIRD_X - BIRD_R < ob.x + PIPE_W;
        const birdInGap = bird.y > ob.gapY - GAP / 2 && bird.y < ob.gapY + GAP / 2;
        if (birdInX && !birdInGap) {
          // Hit pipe — ask question
          triggerQuestion(ob);
          ob.passed = true;
          return;
        }
        if (!ob.passed && ob.x + PIPE_W < BIRD_X - BIRD_R) {
          ob.passed = true;
        }
      }

      // Floor/ceiling
      if (bird.y + BIRD_R > H || bird.y - BIRD_R < 0) {
        stateRef.current = "dead";
        setGameState("dead");
        return;
      }

      // Draw
      ctx.clearRect(0, 0, W, H);

      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#dbeafe");
      sky.addColorStop(1, "#bfdbfe");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Ground
      ctx.fillStyle = "#86efac";
      ctx.fillRect(0, H - 20, W, 20);
      ctx.fillStyle = "#4ade80";
      ctx.fillRect(0, H - 24, W, 6);

      // Pipes
      for (const ob of obstaclesRef.current) {
        ctx.fillStyle = "#3b82f6";
        ctx.beginPath();
        ctx.roundRect(ob.x, 0, PIPE_W, ob.gapY - GAP / 2, [0, 0, 8, 8]);
        ctx.fill();
        ctx.fillStyle = "#2563eb";
        ctx.fillRect(ob.x - 4, ob.gapY - GAP / 2 - 20, PIPE_W + 8, 20);

        ctx.fillStyle = "#3b82f6";
        ctx.beginPath();
        ctx.roundRect(ob.x, ob.gapY + GAP / 2, PIPE_W, H - (ob.gapY + GAP / 2) - 20, [8, 8, 0, 0]);
        ctx.fill();
        ctx.fillStyle = "#2563eb";
        ctx.fillRect(ob.x - 4, ob.gapY + GAP / 2, PIPE_W + 8, 20);

        // Card label on pipe
        ctx.fillStyle = "#facc15";
        ctx.font = "bold 9px Inter, sans-serif";
        ctx.textAlign = "center";
        const label = ob.card.front.length > 18 ? ob.card.front.slice(0, 18) + "…" : ob.card.front;
        ctx.fillText(label, ob.x + PIPE_W / 2, ob.gapY - GAP / 2 - 6);
      }

      // Bird (owl face)
      const bx = BIRD_X, by = bird.y;
      ctx.save();
      ctx.translate(bx, by);
      const angle = Math.max(-0.4, Math.min(0.6, bird.vy * 0.04));
      ctx.rotate(angle);
      // Body
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.ellipse(0, 0, BIRD_R, BIRD_R * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Face
      ctx.fillStyle = "#dbeafe";
      ctx.beginPath();
      ctx.ellipse(2, -1, 10, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Eyes
      ctx.fillStyle = "#1e293b";
      ctx.beginPath(); ctx.arc(-2, -3, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(6, -3, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "white";
      ctx.beginPath(); ctx.arc(-1, -4, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(7, -4, 1, 0, Math.PI * 2); ctx.fill();
      // Beak
      ctx.fillStyle = "#facc15";
      ctx.beginPath(); ctx.moveTo(2, 1); ctx.lineTo(8, 0); ctx.lineTo(2, 3); ctx.fill();
      ctx.restore();

      // Score HUD
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 20px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${scoreRef.current} / ${QUESTIONS_TO_WIN}`, 12, 30);
      ctx.font = "12px Inter, sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.fillText("Space / Tap to jump", 12, 50);

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [gameState, triggerQuestion]);

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <Confetti trigger={celebrate} origin={{ x: 0.5, y: 0.4 }} />

      <div className="mb-5">
        <h1 className="text-3xl font-extrabold gradient-text mb-0.5">Arcade</h1>
        <p className="text-slate-400 text-sm">Fly through pipes — answer the flashcard term to survive.</p>
      </div>

      {/* Canvas */}
      <div
        className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-md cursor-pointer"
        style={{ width: W, maxWidth: "100%" }}
        onClick={jump}
      >
        <canvas ref={canvasRef} width={W} height={H} style={{ display: "block", width: "100%", height: "auto" }} />

        {/* Idle overlay */}
        {gameState === "idle" && (
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-4">
            <div className="text-white text-2xl font-bold">Study Arcade</div>
            <div className="text-white/70 text-sm">Answer flashcard questions to pass obstacles</div>
            <div className="flex flex-col items-center gap-3 bg-white/10 rounded-2xl p-5">
              <select value={filterWeek} onChange={(e) => setFilterWeek(e.target.value)}
                className="px-4 py-2 rounded-xl bg-white text-slate-800 text-sm font-medium w-48">
                <option value="all">All units</option>
                {weeks.map((w) => <option key={w} value={w}>{course.unitLabel(w)}</option>)}
              </select>
              <button onClick={(e) => { e.stopPropagation(); startGame(); }}
                className="px-8 py-2.5 rounded-xl bg-yellow-400 text-slate-900 font-bold hover:bg-yellow-300 transition-colors">
                Start Game
              </button>
            </div>
            {bestScore > 0 && <div className="text-yellow-300 text-sm">Best: {bestScore} / {QUESTIONS_TO_WIN}</div>}
          </div>
        )}

        {/* Dead overlay */}
        {gameState === "dead" && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-3">
            <div className="text-white text-2xl font-bold">Wrong Answer!</div>
            <div className="text-white/70 text-sm">Score: {score} / {QUESTIONS_TO_WIN}</div>
            <button onClick={(e) => { e.stopPropagation(); startGame(); }}
              className="px-8 py-2.5 rounded-xl bg-yellow-400 text-slate-900 font-bold hover:bg-yellow-300 transition-colors mt-2">
              Try Again
            </button>
          </div>
        )}

        {/* Done overlay */}
        {gameState === "done" && (
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-3">
            <div className="text-4xl">🏆</div>
            <div className="text-white text-2xl font-bold">You Won!</div>
            <div className="text-yellow-300 text-sm">{QUESTIONS_TO_WIN} correct answers — Course mastered!</div>
            <button onClick={(e) => { e.stopPropagation(); startGame(); }}
              className="px-8 py-2.5 rounded-xl bg-yellow-400 text-slate-900 font-bold hover:bg-yellow-300 transition-colors mt-2">
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* Question modal */}
      {gameState === "question" && question && (
        <div className="mt-5 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 animate-fade-in">
          <p className="text-xs text-slate-400 mb-2">What term matches this definition?</p>
          <p className="text-base font-semibold text-slate-800 mb-4 leading-relaxed"><MathText text={question.card.back} /></p>
          <div className="grid grid-cols-2 gap-2">
            {question.options.map((opt, i) => (
              <button key={i} onClick={() => answerQuestion(opt)}
                className="py-2.5 px-3 rounded-xl border-2 border-slate-200 text-sm font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 transition-colors text-left">
                <MathText text={opt} />
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-3">Space or click the canvas to jump. Answer the question each time you hit a pipe.</p>
    </div>
  );
}
