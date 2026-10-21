"use client";
import MathText from "@/components/MathText";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import type { DiagMCQ, DiagSA, SaGradeResult } from "@/lib/diagnostic-types";
import { DEFAULT_CLOUD_MODEL_ID, pickAutoModel } from "@/lib/model-policy";
import { dailyTokenLimitForModel } from "@/lib/token-limits";

interface CloudModel { id: string; label: string; context: number; }

const DAILY_TOKEN_KEY = "study-coach-daily-tokens";

function todayISO() { return new Date().toISOString().slice(0, 10); }

function loadDailyTokens(): number {
  try {
    const raw = localStorage.getItem(DAILY_TOKEN_KEY);
    if (!raw) return 0;
    const { date, tokens } = JSON.parse(raw);
    return date === todayISO() ? (tokens as number) : 0;
  } catch { return 0; }
}

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { return { error: res.statusText || "Invalid response" }; }
}

function resolveModelId(selectedRef: string, clouds: { id: string }[], ollamas: string[]): string {
  return (selectedRef || "").trim() || clouds[0]?.id || ollamas[0] || DEFAULT_CLOUD_MODEL_ID;
}

function fmtContext(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M ctx`;
  return `${Math.round(n / 1000)}k ctx`;
}

function normMcqLetter(correct: string): string {
  const t = correct.trim().toUpperCase();
  if (/^[ABCD]$/.test(t)) return t;
  const m = t.match(/^([ABCD])/);
  return m ? m[1] : (t.charAt(0) || "?");
}

function optionLetter(opt: string): string {
  const m = opt.trim().match(/^([A-Da-d])[\.\)]\s*/);
  return m ? m[1].toUpperCase() : opt.trim().charAt(0).toUpperCase();
}

function wikiLinkedText(text: string): ReactNode {
  const parts = text.split(/(\[\[[^\]\n]+\]\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[\[([^\]]+)\]\]$/);
    if (m) {
      const slug = m[1];
      return (
        <Link key={i} href={`/browse/${slug.split("/").map(encodeURIComponent).join("/")}`} className="text-indigo-600 underline font-medium">
          {slug}
        </Link>
      );
    }
    return <span key={i}><MathText text={part} /></span>;
  });
}

function pctLabel(correct: number, total: number): string {
  if (total <= 0) return "—";
  const pct = Math.round((correct / total) * 100);
  let letter = "F";
  if (pct >= 90) letter = "A";
  else if (pct >= 80) letter = "B";
  else if (pct >= 70) letter = "C";
  else if (pct >= 60) letter = "D";
  return `${correct}/${total} (${pct}%) · ${letter}`;
}

function DiagnosticMcq({
  q, index, pick, revealed, onPick,
}: {
  q: DiagMCQ; index: number; pick: Record<number, string>; revealed: boolean;
  onPick: (i: number, letter: string) => void;
}) {
  const chosen = pick[index];
  const correct = normMcqLetter(q.correct);

  return (
    <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/80 space-y-2">
      <p className="text-xs font-semibold text-slate-500">Q{index + 1}</p>
      <p className="text-sm font-medium text-slate-800 leading-snug"><MathText text={q.stem} /></p>
      <div className="space-y-1">
        {q.options.map((opt) => {
          const letter = optionLetter(opt);
          const isSel = chosen === letter;
          const isCor = letter === correct;
          let cls = "w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ";
          if (!revealed) {
            cls += isSel
              ? "border-indigo-500 bg-indigo-50"
              : "border-slate-200 hover:border-indigo-300 cursor-pointer";
          } else if (isCor) {
            cls += "border-emerald-400 bg-emerald-50 text-emerald-900";
          } else if (isSel && !isCor) {
            cls += "border-red-300 bg-red-50 text-red-800";
          } else {
            cls += "border-slate-100 text-slate-400";
          }
          return (
            <button
              key={letter + opt.slice(0, 20)}
              type="button"
              disabled={revealed}
              onClick={() => onPick(index, letter)}
              className={cls}
            >
              <MathText text={opt} />
            </button>
          );
        })}
      </div>
      {revealed && (
        <p className="text-xs text-slate-600 mt-1">
          {chosen === correct ? (
            <span className="text-emerald-700 font-medium">Correct.</span>
          ) : (
            <span className="text-red-700 font-medium">Answer: {correct}. </span>
          )}
          <span className="whitespace-pre-wrap">{wikiLinkedText(q.explanation)}</span>
        </p>
      )}
    </div>
  );
}

export default function TestPage() {
  const [difficulty, setDifficulty] = useState(3);
  const [saStrictness, setSaStrictness] = useState(3);

  const [diag, setDiag] = useState<{ mcqs: DiagMCQ[]; sas: DiagSA[]; notice?: string | null } | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagErr, setDiagErr] = useState<string | null>(null);
  const [diagMcqPick, setDiagMcqPick] = useState<Record<number, string>>({});
  const [diagMcqRevealed, setDiagMcqRevealed] = useState(false);
  const [diagSaText, setDiagSaText] = useState<string[]>(["", "", "", ""]);
  const [diagSaLoading, setDiagSaLoading] = useState(false);
  const [diagSaGrades, setDiagSaGrades] = useState<SaGradeResult[] | null>(null);
  const [mcqReadiness, setMcqReadiness] = useState<string | null>(null);
  const [saReadiness, setSaReadiness] = useState<string | null>(null);

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [cloudModels, setCloudModels] = useState<CloudModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "online" | "offline">("checking");
  const [autoModelHint, setAutoModelHint] = useState<string | null>(null);
  const [dailyTokens, setDailyTokens] = useState(0);

  const cloudModelsRef = useRef<CloudModel[]>([]);
  const ollamaModelsRef = useRef<string[]>([]);
  const selectedModelRef = useRef(selectedModel);
  const difficultyRef = useRef(difficulty);
  const dailyTokensRef = useRef(dailyTokens);

  useEffect(() => { cloudModelsRef.current = cloudModels; }, [cloudModels]);
  useEffect(() => { ollamaModelsRef.current = ollamaModels; }, [ollamaModels]);
  useEffect(() => { selectedModelRef.current = selectedModel; }, [selectedModel]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  useEffect(() => { dailyTokensRef.current = dailyTokens; }, [dailyTokens]);

  useEffect(() => {
    setDailyTokens(loadDailyTokens());
  }, []);

  useEffect(() => {
    fetch("/api/ollama-models")
      .then((r) => r.json())
      .then(({ models }: { models: string[] }) => {
        if (models.length > 0) {
          setOllamaModels(models);
          setOllamaStatus("online");
          setSelectedModel((prev) => prev || models[0]);
        } else {
          setOllamaStatus("offline");
        }
      })
      .catch(() => setOllamaStatus("offline"));

    fetch("/api/cloud-models")
      .then((r) => r.json())
      .then(({ models }: { models: CloudModel[] }) => {
        setCloudModels(models);
        setSelectedModel((prev) => prev || (models[0]?.id ?? DEFAULT_CLOUD_MODEL_ID));
      })
      .catch(() => {});
  }, []);

  const dailyLimit = dailyTokenLimitForModel(selectedModel);
  const hasModels = ollamaModels.length > 0 || cloudModels.length > 0;

  const applyAutoModel = useCallback(() => {
    const { id, reason } = pickAutoModel({ dailyTokens, dailyLimit, ollamaModels, cloudModels });
    setSelectedModel(id);
    selectedModelRef.current = id;
    setAutoModelHint(reason);
  }, [dailyTokens, dailyLimit, ollamaModels, cloudModels]);

  const reset = () => {
    setDiag(null);
    setDiagLoading(false);
    setDiagErr(null);
    setDiagMcqPick({});
    setDiagMcqRevealed(false);
    setDiagSaText(["", "", "", ""]);
    setDiagSaGrades(null);
    setMcqReadiness(null);
    setSaReadiness(null);
  };

  const startDiagnostic = useCallback(async () => {
    const initialModel = resolveModelId(selectedModelRef.current, cloudModelsRef.current, ollamaModelsRef.current);
    reset();
    setDiagLoading(true);
    try {
      const d = difficultyRef.current;

      const attemptFetch = async (model: string, isRetry: boolean): Promise<void> => {
        if (model !== selectedModelRef.current) {
          setSelectedModel(model);
          selectedModelRef.current = model;
        }
        const qs = new URLSearchParams({
          model,
          difficulty: String(d),
          saStrictness: String(saStrictness),
          variant: String(Math.floor(Math.random() * 12)),
        });
        const res = await fetch(`/api/diagnostic?${qs.toString()}`);
        const data = await safeJson(res);

        if (!res.ok) {
          const errMsg = String(data.error ?? res.statusText ?? "Diagnostic failed.");
          const isRateLimit = res.status === 429 || /rate limit|too many requests|429/i.test(errMsg);
          if (isRateLimit && !isRetry) {
            const pick = pickAutoModel({
              dailyTokens: dailyTokensRef.current,
              dailyLimit: dailyTokenLimitForModel(selectedModelRef.current),
              ollamaModels: ollamaModelsRef.current,
              cloudModels: cloudModelsRef.current,
            });
            setAutoModelHint(`${pick.reason} Retrying…`);
            setSelectedModel(pick.id);
            selectedModelRef.current = pick.id;
            await attemptFetch(pick.id, true);
            return;
          }
          const detail = data.detail as
            | { mcqLate?: number; mcqEarly?: number; saLate?: number; saEarly?: number }
            | undefined;
          const countHint =
            detail && typeof detail === "object" &&
            [detail.mcqLate, detail.mcqEarly, detail.saLate, detail.saEarly].some((n) => typeof n === "number")
              ? ` Received after slug-based fixes: ${detail.mcqLate ?? "?"} late / ${detail.mcqEarly ?? "?"} early MCQs; ${detail.saLate ?? "?"} late / ${detail.saEarly ?? "?"} early short answers.`
              : "";
          setDiagErr(
            res.status === 503
              ? errMsg
              : `${errMsg}${countHint}${isRateLimit ? " Try Auto or a free/local model." : ""}`
          );
          return;
        }

        const mcqs = data.mcqs as DiagMCQ[] | undefined;
        const sas = data.sas as DiagSA[] | undefined;
        if (!mcqs?.length || !sas?.length) {
          setDiagErr("Invalid response from server.");
          return;
        }
        setDiag({ mcqs, sas, notice: typeof data.notice === "string" ? data.notice : null });
        setDiagSaText(Array.from({ length: sas.length }, () => ""));
      };

      await attemptFetch(initialModel, false);
    } catch {
      setDiagErr("Could not load diagnostic (network error).");
    } finally {
      setDiagLoading(false);
    }
  }, [saStrictness]);

  const revealDiagMcqs = () => {
    if (!diag) return;
    let correct = 0;
    for (let i = 0; i < diag.mcqs.length; i++) {
      const want = normMcqLetter(diag.mcqs[i].correct);
      if (diagMcqPick[i] === want) correct++;
    }
    setDiagMcqRevealed(true);
    setMcqReadiness(pctLabel(correct, diag.mcqs.length));
  };

  const gradeDiagShortAnswers = async () => {
    if (!diag) return;
    const model = resolveModelId(selectedModelRef.current, cloudModelsRef.current, ollamaModelsRef.current);
    if (model !== selectedModelRef.current) {
      setSelectedModel(model);
      selectedModelRef.current = model;
    }
    setDiagSaLoading(true);
    setDiagErr(null);
    try {
      const items = diag.sas.map((s, i) => ({
        index: i,
        stem: s.stem,
        concept: s.concept,
        sourceSlug: s.sourceSlug,
        studentAnswer: diagSaText[i] ?? "",
      }));
      const res = await fetch("/api/diagnostic/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, difficulty: difficultyRef.current, saStrictness, items }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setDiagErr(String(data.error ?? res.statusText ?? "Grading failed."));
        return;
      }
      const grades = data.grades as SaGradeResult[] | undefined;
      if (!grades?.length) {
        setDiagErr("Invalid grading response.");
        return;
      }
      setDiagSaGrades(grades);
      if (grades.length) {
        const avg = Math.round(grades.reduce((a, g) => a + g.score, 0) / grades.length);
        let letter = "F";
        if (avg >= 90) letter = "A";
        else if (avg >= 80) letter = "B";
        else if (avg >= 70) letter = "C";
        else if (avg >= 60) letter = "D";
        setSaReadiness(`avg ${avg}% · ${letter}`);
      }
    } catch {
      setDiagErr("Could not grade short answers.");
    } finally {
      setDiagSaLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold gradient-text">Test My Knowledge</h1>
          <p className="text-slate-400 text-sm mt-0.5">About 30 multiple-choice questions + 4 short answers · graded against your notes</p>
          {(mcqReadiness || saReadiness) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {mcqReadiness && (
                <span className="text-[11px] font-medium px-2 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
                  MCQ score: {mcqReadiness}
                </span>
              )}
              {saReadiness && (
                <span className="text-[11px] font-medium px-2 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
                  Short answer: {saReadiness}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Difficulty */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Difficulty</span>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  title={["Easy", "Moderate", "Standard", "Hard", "Expert"][d - 1]}
                  className={`w-6 h-6 rounded text-xs font-semibold transition-colors ${
                    d <= difficulty ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* SA rubric */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">SA rubric</span>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSaStrictness(d)}
                  title={["Lenient", "Light", "Standard", "Strict", "Exam-strict"][d - 1]}
                  className={`w-6 h-6 rounded text-xs font-semibold transition-colors ${
                    d <= saStrictness ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Model selector */}
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                type="button"
                onClick={applyAutoModel}
                title={autoModelHint ?? "Choose a model based on daily token usage"}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50 shadow-sm shrink-0"
              >
                Auto
              </button>
              {hasModels && (
                <div className="flex items-center gap-2">
                  {ollamaStatus === "online" && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  )}
                  <select
                    value={selectedModel}
                    onChange={(e) => { setSelectedModel(e.target.value); setAutoModelHint(null); }}
                    className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 shadow-sm max-w-[220px]"
                  >
                    {ollamaModels.length > 0 && (
                      <optgroup label="Ollama (local)">
                        {ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)}
                      </optgroup>
                    )}
                    {cloudModels.length > 0 && (
                      <optgroup label="Cloud">
                        {cloudModels.map((m) => (
                          <option key={m.id} value={m.id}>{m.label} · {fmtContext(m.context)}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              )}
              {!hasModels && ollamaStatus !== "checking" && (
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">No models available</span>
              )}
              {ollamaStatus === "checking" && (
                <span className="text-xs text-slate-400">checking Ollama…</span>
              )}
            </div>
            {autoModelHint && (
              <p className="text-[10px] text-slate-500 text-right max-w-[240px] leading-snug">{autoModelHint}</p>
            )}
          </div>

          {diag && (
            <button
              type="button"
              onClick={reset}
              className="text-sm text-slate-400 hover:text-slate-600 underline"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Start state */}
      {!diag && !diagLoading && !diagErr && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="text-6xl">📋</div>
          <div className="text-center space-y-1">
            <p className="text-lg font-semibold text-slate-700">Ready to test yourself?</p>
            <p className="text-sm text-slate-400">About 30 multiple-choice questions + 4 short answers, graded against your notes</p>
          </div>
          <button
            type="button"
            onClick={() => void startDiagnostic()}
            disabled={diagLoading}
            className="mt-2 px-8 py-3.5 rounded-2xl text-base font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-95 disabled:opacity-40 shadow-md"
          >
            Start Diagnostic
          </button>
        </div>
      )}

      {/* Loading */}
      {diagLoading && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Writing your test (multiple-choice + short answers)… this can take a couple of minutes.</p>
        </div>
      )}

      {/* Error */}
      {diagErr && (
        <div className="space-y-3">
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{diagErr}</p>
          <button
            type="button"
            onClick={() => void startDiagnostic()}
            disabled={diagLoading}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white disabled:opacity-40"
          >
            Try again
          </button>
        </div>
      )}

      {/* Diagnostic content */}
      {diag && (
        <div className="space-y-6">
          {/* Info banner */}
          <div className="border border-indigo-100 rounded-xl px-4 py-3 bg-indigo-50/40 text-xs text-slate-500">
            {diag.mcqs.length} multiple-choice questions, weighted towards the later part of the course, and {diag.sas.length} short answers. Answer all the multiple-choice questions, then score them; short-answer grading unlocks after that.
            {diag.notice && <span className="block mt-1 font-medium text-amber-700">{diag.notice}</span>}
          </div>

          {/* MCQ section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Multiple Choice</h2>
              {mcqReadiness && (
                <span className="text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-lg">
                  Score: {mcqReadiness}
                </span>
              )}
            </div>
            <div className="space-y-3">
              {diag.mcqs.map((q, i) => (
                <DiagnosticMcq
                  key={i}
                  q={q}
                  index={i}
                  pick={diagMcqPick}
                  revealed={diagMcqRevealed}
                  onPick={(idx, letter) => setDiagMcqPick((p) => ({ ...p, [idx]: letter }))}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={revealDiagMcqs}
              disabled={diagMcqRevealed}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white disabled:opacity-40"
            >
              {diagMcqRevealed ? "MCQs scored ✓" : "Score MCQs"}
            </button>
          </div>

          {/* Short answer section */}
          <div className="border-t border-slate-200 pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Short Answers</h2>
              {saReadiness && (
                <span className="text-sm font-semibold text-violet-700 bg-violet-50 border border-violet-100 px-3 py-1 rounded-lg">
                  Score: {saReadiness}
                </span>
              )}
            </div>
            {diag.sas.map((s, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-500">SA{i + 1}</p>
                <p className="text-sm text-slate-800 leading-snug"><MathText text={s.stem} /></p>
                <textarea
                  value={diagSaText[i] ?? ""}
                  onChange={(e) =>
                    setDiagSaText((prev) => {
                      const next = [...prev];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                  rows={5}
                  disabled={diagSaLoading}
                  placeholder="Identify the concept, define it, and apply it to the scenario…"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400 bg-white"
                />
                {diagSaGrades?.find((g) => g.index === i) && (
                  <div className="text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 space-y-1">
                    <p className="font-semibold text-indigo-700">
                      Score: {(diagSaGrades.find((g) => g.index === i) as SaGradeResult).score}/100
                    </p>
                    <p className="leading-relaxed">
                      {wikiLinkedText((diagSaGrades.find((g) => g.index === i) as SaGradeResult).feedback)}
                    </p>
                  </div>
                )}
              </div>
            ))}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => void gradeDiagShortAnswers()}
                disabled={diagSaLoading || !diagMcqRevealed}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white disabled:opacity-40"
              >
                {diagSaLoading ? "Grading…" : "Grade short answers (wiki-linked feedback)"}
              </button>
              {!diagMcqRevealed && (
                <p className="text-xs text-slate-400">Score MCQs first to unlock short-answer grading.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
