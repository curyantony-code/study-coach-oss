"use client";
import MathText from "@/components/MathText";
import { vaultStorageKey } from "@/lib/progress";
import { useCourse } from "@/lib/use-course";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import { DEFAULT_CLOUD_MODEL_ID, pickAutoModel } from "@/lib/model-policy";
import { dailyTokenLimitForModel } from "@/lib/token-limits";

interface Message { role: "user" | "assistant"; content: string; }

interface CloudModel { id: string; label: string; context: number; }

interface McqData {
  stem: string;
  options: string[];
  correct: string;
  explanation: string;
}

const STORAGE_KEY = "study-coach-chat-session";
const DAILY_TOKEN_KEY = "study-coach-daily-tokens";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function loadDailyTokens(): number {
  try {
    const raw = localStorage.getItem(DAILY_TOKEN_KEY);
    if (!raw) return 0;
    const { date, tokens } = JSON.parse(raw);
    return date === todayISO() ? (tokens as number) : 0;
  } catch { return 0; }
}

function saveDailyTokens(total: number) {
  try {
    localStorage.setItem(DAILY_TOKEN_KEY, JSON.stringify({ date: todayISO(), tokens: total }));
  } catch { /* ignore */ }
}

function maskStreamingMcq(content: string): string {
  content = content.replace(/<MCQ>[\s\S]*?<\/MCQ>/gi, "\n*(question loading…)*\n");
  content = content.replace(/<MCQ>[\s\S]*$/i, "\n*(question loading…)*");
  return content;
}

function parseMcq(content: string): { pre: string; mcq: McqData | null; post: string } {
  const match = content.match(/<MCQ>([\s\S]*?)<\/MCQ>/i);
  if (!match) return { pre: content, mcq: null, post: "" };
  const idx = content.indexOf(match[0]);
  const pre = content.slice(0, idx);
  const post = content.slice(idx + match[0].length);
  try {
    return { pre, mcq: JSON.parse(match[1].trim()) as McqData, post };
  } catch {
    return { pre: content, mcq: null, post: "" };
  }
}

function fmtContext(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M ctx`;
  return `${Math.round(n / 1000)}k ctx`;
}

function McqBlock({
  mcq,
  msgIndex,
  answers,
  onAnswer,
}: {
  mcq: McqData;
  msgIndex: number;
  answers: Record<number, string>;
  onAnswer: (idx: number, letter: string, optionText: string) => void;
}) {
  const selected = answers[msgIndex];
  const letters = mcq.options.map((o) => o.charAt(0));

  return (
    <div className="mt-3 space-y-2">
      <p className="font-medium text-slate-800 text-sm leading-snug"><MathText text={mcq.stem} /></p>
      <div className="space-y-1.5">
        {mcq.options.map((opt, i) => {
          const letter = letters[i];
          const isSelected = selected === letter;
          const isCorrect = letter === mcq.correct;
          const answered = !!selected;

          let cls = "w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ";
          if (!answered) {
            cls += "border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer";
          } else if (isSelected && isCorrect) {
            cls += "bg-emerald-50 border-emerald-400 text-emerald-800 font-semibold";
          } else if (isSelected && !isCorrect) {
            cls += "bg-red-50 border-red-400 text-red-700";
          } else if (!isSelected && isCorrect) {
            cls += "bg-emerald-50 border-emerald-300 text-emerald-700";
          } else {
            cls += "border-slate-100 text-slate-400";
          }

          return (
            <button
              key={letter}
              disabled={answered}
              onClick={() => onAnswer(msgIndex, letter, opt)}
              className={cls}
            >
              {!answered && <span className="inline-block w-4 h-4 rounded-full border border-slate-300 mr-2 align-middle" />}
              {answered && isSelected && isCorrect && <span className="mr-2">✓</span>}
              {answered && isSelected && !isCorrect && <span className="mr-2">✗</span>}
              {answered && !isSelected && isCorrect && <span className="mr-2">✓</span>}
              <MathText text={opt} />
            </button>
          );
        })}
      </div>
      {selected && (
        <div className={`mt-2 text-xs px-3 py-2 rounded-lg border ${
          selected === mcq.correct
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {selected === mcq.correct ? "Correct! " : `Incorrect — the answer is ${mcq.correct}. `}
          <MathText text={mcq.explanation} />
        </div>
      )}
    </div>
  );
}

/** Conversation starters built from the course's own units. */
function suggestionsFor(units: { label: string }[]): string[] {
  const first = units[0]?.label;
  const middle = units[Math.floor(units.length / 2)]?.label;
  const last = units[units.length - 1]?.label;
  return [
    first ? `Let's start studying: begin with ${first}` : "Let's start studying from the beginning",
    middle && middle !== first ? `Explain the main ideas in ${middle}` : "Explain the most important idea in this course",
    last && last !== middle ? `Quiz me on ${last}` : "Quiz me on what I should know by now",
    "What are the most common mistakes students make in this course?",
    "Give me a hard exam-style question and mark my answer",
  ];
}

export default function ChatPage() {
  const course = useCourse();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mcqAnswers, setMcqAnswers] = useState<Record<number, string>>({});
  const [sessionTokens, setSessionTokens] = useState(0);   // tokens this chat session
  const [dailyTokens, setDailyTokens] = useState(0);       // tokens today (persisted)
  const [difficulty, setDifficulty] = useState(3);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  const [autoModelHint, setAutoModelHint] = useState<string | null>(null);

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [cloudModels, setCloudModels] = useState<CloudModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const dailyLimit = dailyTokenLimitForModel(selectedModel);
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "online" | "offline">("checking");

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hydrated = useRef(false);
  const cloudModelsRef = useRef<CloudModel[]>([]);
  const ollamaModelsRef = useRef<string[]>([]);

  // Refs to avoid stale closures in send()
  const messagesRef = useRef(messages);
  const sessionTokensRef = useRef(sessionTokens);
  const dailyTokensRef = useRef(dailyTokens);
  const selectedModelRef = useRef(selectedModel);
  const difficultyRef = useRef(difficulty);
  const streamingRef = useRef(streaming);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { sessionTokensRef.current = sessionTokens; }, [sessionTokens]);
  useEffect(() => { dailyTokensRef.current = dailyTokens; }, [dailyTokens]);
  useEffect(() => { selectedModelRef.current = selectedModel; }, [selectedModel]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  useEffect(() => { streamingRef.current = streaming; }, [streaming]);
  useEffect(() => {
    cloudModelsRef.current = cloudModels;
  }, [cloudModels]);
  useEffect(() => {
    ollamaModelsRef.current = ollamaModels;
  }, [ollamaModels]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  // Restore session + daily tokens from localStorage on mount
  useEffect(() => {
    // Browser storage only exists after the page has loaded, so saved state is put back here.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const raw = localStorage.getItem(vaultStorageKey(STORAGE_KEY));
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.messages?.length) setMessages(saved.messages);
        if (saved.mcqAnswers) setMcqAnswers(saved.mcqAnswers);
        if (saved.sessionTokens) setSessionTokens(saved.sessionTokens);
        if (saved.difficulty) setDifficulty(saved.difficulty);
      }
    } catch { /* ignore corrupt storage */ }
    setDailyTokens(loadDailyTokens());
    /* eslint-enable react-hooks/set-state-in-effect */
    hydrated.current = true;
  }, []);

  // Persist session to localStorage on every relevant change (after hydration)
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(vaultStorageKey(STORAGE_KEY), JSON.stringify({ messages, mcqAnswers, sessionTokens, difficulty }));
    } catch { /* storage full — ignore */ }
  }, [messages, mcqAnswers, sessionTokens, difficulty]);

  // Persist daily token count whenever it changes
  useEffect(() => {
    if (!hydrated.current) return;
    saveDailyTokens(dailyTokens);
  }, [dailyTokens]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Fetch Ollama and cloud model lists in parallel
  useEffect(() => {
    fetch("/api/ollama-models")
      .then((r) => r.json())
      .then(({ models }: { models: string[] }) => {
        if (models.length > 0) {
          setOllamaModels(models);
          setOllamaStatus("online");
          // Only set default model if nothing is selected yet
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

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? "").trim();
    if (!msg || streamingRef.current) return;
    const currentMessages = messagesRef.current;
    const newMessages: Message[] = [...currentMessages, { role: "user", content: msg }];
    setMessages(newMessages);
    setStreaming(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          model: selectedModelRef.current || undefined,
          sessionTokensUsed: dailyTokensRef.current,  // server enforces daily limit
          difficulty: difficultyRef.current,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setMessages((p) => [...p, { role: "assistant", content: `Error: ${err.error}` }]);
        setStreaming(false);
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let asst = "";
      setMessages((p) => [...p, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        asst += decoder.decode(value, { stream: true });
        setMessages((p) => { const n = [...p]; n[n.length - 1] = { role: "assistant", content: asst }; return n; });
      }
      const usageMatch = asst.match(/\n__USAGE__(\d+)$/);
      if (usageMatch) {
        const turn = parseInt(usageMatch[1], 10);
        setSessionTokens((t) => t + turn);
        setDailyTokens((t) => t + turn);
        const clean = asst.slice(0, asst.length - usageMatch[0].length);
        setMessages((p) => { const n = [...p]; n[n.length - 1] = { role: "assistant", content: clean }; return n; });
      }
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: "Connection error." }]);
    }
    setStreaming(false);
  }, []);

  const sendInput = () => {
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    send(msg);
  };

  const handleAnswer = (msgIndex: number, letter: string, optionText: string) => {
    setMcqAnswers((prev) => ({ ...prev, [msgIndex]: letter }));
    send(`I chose ${letter}: ${optionText}`);
  };

  const clearSession = () => {
    setMessages([]);
    setMcqAnswers({});
    setSessionTokens(0);
    setAutoModelHint(null);
    try { localStorage.removeItem(vaultStorageKey(STORAGE_KEY)); } catch { /* ignore */ }
  };

  const applyAutoModel = useCallback(() => {
    const { id, reason } = pickAutoModel({
      dailyTokens,
      dailyLimit,
      ollamaModels,
      cloudModels,
    });
    setSelectedModel(id);
    selectedModelRef.current = id;
    setAutoModelHint(reason);
  }, [dailyTokens, dailyLimit, ollamaModels, cloudModels]);

  const hasModels = ollamaModels.length > 0 || cloudModels.length > 0;

  return (
    <div className={isFullscreen
      ? "fixed inset-0 z-50 bg-white flex flex-col p-6 overflow-hidden"
      : "max-w-3xl mx-auto flex flex-col h-[calc(100vh-8rem)] animate-fade-in"
    }>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className={`font-extrabold gradient-text ${isFullscreen ? "text-5xl" : "text-3xl"}`}>AI Tutor</h1>
          <p className={`text-slate-400 ${isFullscreen ? "text-base" : "text-sm"}`}>Grounded in your notes</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(f => !f)}
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors shrink-0"
          >
            {isFullscreen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/></svg>
            )}
          </button>

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

          {/* Model selector — grouped: Ollama + Cloud */}
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                type="button"
                onClick={applyAutoModel}
                title={autoModelHint ?? "Choose a model from daily token usage (prefers Ollama or free tier when usage is high)"}
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
                onChange={(e) => {
                  setSelectedModel(e.target.value);
                  setAutoModelHint(null);
                }}
                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 shadow-sm max-w-[200px]"
              >
                {ollamaModels.length > 0 && (
                  <optgroup label="Ollama (local)">
                    {ollamaModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </optgroup>
                )}
                {cloudModels.length > 0 && (
                  <>
                    <optgroup label="Cloud · Free">
                      {cloudModels.filter((m) => m.label.includes("free")).map((m) => (
                        <option key={m.id} value={m.id}>{m.label} · {fmtContext(m.context)}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Cloud · Fast">
                      {cloudModels.filter((m) => !m.label.includes("free") && !m.label.match(/Opus|Pro|GPT-4o(?!.*Mini)|Sonnet|R1/)).map((m) => (
                        <option key={m.id} value={m.id}>{m.label} · {fmtContext(m.context)}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Cloud · Powerful">
                      {cloudModels.filter((m) => !!m.label.match(/Opus|Pro|GPT-4o(?!.*Mini)|Sonnet|R1/)).map((m) => (
                        <option key={m.id} value={m.id}>{m.label} · {fmtContext(m.context)}</option>
                      ))}
                    </optgroup>
                  </>
                )}
              </select>
            </div>
              )}
            </div>
            {autoModelHint && (
              <p className="text-[10px] text-slate-500 text-right max-w-[240px] leading-snug">{autoModelHint}</p>
            )}
          </div>
          {!hasModels && ollamaStatus !== "checking" && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
              No models available
            </span>
          )}
          {ollamaStatus === "checking" && (
            <span className="text-xs text-slate-400">checking Ollama…</span>
          )}

          {/* Daily token bar */}
          {dailyTokens > 0 && (
            <div className="flex flex-col items-end gap-0.5">
              <div className="w-28 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    dailyTokens / dailyLimit > 0.8 ? "bg-red-400" :
                    dailyTokens / dailyLimit > 0.5 ? "bg-amber-400" : "bg-emerald-400"
                  }`}
                  style={{ width: `${Math.min(100, (dailyTokens / dailyLimit) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400" title="Resets at midnight">
                {dailyTokens.toLocaleString()} / {dailyLimit.toLocaleString()} today
              </span>
            </div>
          )}

          {messages.length > 0 && (
            <>
              <Link href="/test" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
                Test me
              </Link>
              <button onClick={clearSession} className="text-sm text-slate-400 hover:text-slate-600 underline">
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
        {messages.length === 0 && (
          <div className="py-6 space-y-4">
            <Link
              href="/test"
              className="block w-full py-4 rounded-2xl text-base font-bold text-white text-center bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-95 shadow-md"
            >
              Test my knowledge →
            </Link>
            <p className="text-sm font-semibold text-slate-400">Suggested questions</p>
            <div className="space-y-2">
              {suggestionsFor(course.units).map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="w-full text-left p-3 bg-white border border-slate-100 rounded-xl text-sm text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-sm">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const isStreamingThis = streaming && i === messages.length - 1 && m.role === "assistant";
          const displayContent = isStreamingThis ? maskStreamingMcq(m.content) : m.content;
          const { pre, mcq, post } = m.role === "assistant" && !isStreamingThis
            ? parseMcq(m.content)
            : { pre: displayContent, mcq: null, post: "" };

          return (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`rounded-2xl leading-relaxed shadow-sm ${isFullscreen ? "max-w-[80%] px-6 py-4 text-base" : "max-w-[85%] px-4 py-3 text-sm"} ${
                m.role === "user"
                  ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-br-sm whitespace-pre-wrap"
                  : "bg-white border border-slate-100 text-slate-800 rounded-bl-sm"
              }`}>
                {m.role === "user" ? m.content : (
                  <>
                    {pre && <span className="whitespace-pre-wrap"><MathText text={pre} /></span>}
                    {mcq && (
                      <McqBlock
                        mcq={mcq}
                        msgIndex={i}
                        answers={mcqAnswers}
                        onAnswer={handleAnswer}
                      />
                    )}
                    {post && <span className="whitespace-pre-wrap"><MathText text={post} /></span>}
                    {isStreamingThis && (
                      <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-1 animate-pulse align-middle rounded-full" />
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendInput(); } }}
          placeholder="Ask about your course… (Enter to send)"
          rows={isFullscreen ? 3 : 2}
          className={`flex-1 border-2 border-slate-200 rounded-xl px-4 py-2.5 resize-none focus:outline-none focus:border-indigo-400 bg-white shadow-sm ${isFullscreen ? "text-base" : "text-sm"}`}
          disabled={streaming}
        />
        <button
          onClick={sendInput}
          disabled={streaming || !input.trim()}
          className={`rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90 disabled:opacity-40 transition-opacity shadow-sm shrink-0 ${isFullscreen ? "px-7 py-3 text-base" : "px-5 py-2.5"}`}
        >
          {streaming ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
