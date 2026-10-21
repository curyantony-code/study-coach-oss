"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Answer from "@/components/ai/Answer";
import MathText from "@/components/MathText";

const QUOTE_PREVIEW = 400;
const USAGE_MARKER = /\n__USAGE__\d+\s*$/;

const QUICK_QUESTIONS = [
  { label: "Explain simply", question: "Explain this in simple terms, step by step." },
  { label: "Give an example", question: "Give me a small worked example of this." },
  { label: "Why does it matter?", question: "Why does this matter, and how could it show up on an exam?" },
];

interface Turn {
  role: "user" | "assistant";
  content: string;
  /** Shown in place of the full first message, which also carries the quoted text. */
  label?: string;
}

const PRIMARY = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";

interface AskPanelProps {
  /** The Library note the AI uses as its source. */
  slug: string;
  /** The text being asked about. */
  quote: string;
  title: string;
  /** What leaves this computer, e.g. "Sends the highlight and this note to OpenRouter." */
  disclosure: string;
  onClose: () => void;
}

/**
 * A small chat about one piece of text, answered from the note it belongs to.
 * Mount it with a `key` that changes with the quote, so each quote starts a fresh conversation.
 */
export default function AskPanel({ slug, quote, title, disclosure, onClose }: AskPanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Keyboard focus moves into the panel, stays inside it, and goes back where it was on close.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return onClose();
      if (event.key !== "Tab" || !panel.current) return;
      const stops = [...panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href]")];
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const inside = panel.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [onClose]);

  useEffect(() => () => request.current?.abort(), []);

  const ask = useCallback(
    async (question: string, earlier: Turn[]) => {
      const isFirst = earlier.length === 0;
      const asked: Turn = { role: "user", content: question, label: question || "Explain this" };
      const history = [...earlier, asked];
      setTurns([...history, { role: "assistant", content: "" }]);
      setBusy(true);
      setError("");
      const controller = new AbortController();
      request.current = controller;
      try {
        const response = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            slug,
            selection: quote,
            // The first question travels with the quote; later ones are follow-ups.
            question: isFirst ? question : earlier[0].content,
            followUps: isFirst ? [] : history.slice(1).map(({ role, content }) => ({ role, content })),
          }),
        });
        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "The AI could not answer just now.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let answer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          setTurns([...history, { role: "assistant", content: answer }]);
        }
        const clean = answer.replace(USAGE_MARKER, "").trim();
        if (!clean) throw new Error("The AI returned an empty answer. Try again.");
        setTurns([...history, { role: "assistant", content: clean }]);
      } catch (err) {
        if (controller.signal.aborted) return;
        setTurns(earlier);
        setError(err instanceof Error ? err.message : "The AI could not answer just now.");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [slug, quote]
  );

  const submit = (question: string) => {
    if (busy) return;
    setDraft("");
    void ask(question.trim(), turns);
  };

  const started = turns.length > 0;

  // Rendered on <body>: a page's fade-in animation would otherwise trap "fixed" elements inside it.
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      data-ask-panel
      aria-label={title}
      tabIndex={-1}
      className="fixed z-40 inset-x-0 bottom-0 md:inset-x-auto md:right-4 md:bottom-4 md:w-[28rem] max-h-[80vh] flex flex-col rounded-t-3xl md:rounded-3xl border border-slate-200 bg-white shadow-2xl focus:outline-none"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close"
          className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          Close
        </button>
      </div>

      <div className="overflow-y-auto px-5 pb-3 text-sm text-slate-800">
        <blockquote className="border-l-4 border-blue-300 bg-blue-50 rounded-r-xl px-3 py-2 mb-3 text-slate-700 whitespace-pre-line">
          <MathText text={quote.length > QUOTE_PREVIEW ? `${quote.slice(0, QUOTE_PREVIEW)}…` : quote} />
        </blockquote>

        {!started && (
          <div className="flex flex-wrap gap-2 mb-3">
            {QUICK_QUESTIONS.map((q) => (
              <button key={q.label} type="button" disabled={busy} onClick={() => submit(q.question)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 active:bg-blue-100 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                {q.label}
              </button>
            ))}
          </div>
        )}

        <div aria-live="polite">
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <p key={i} className="font-semibold text-slate-900 mb-1 mt-3 first:mt-0">{turn.label ?? turn.content}</p>
            ) : turn.content ? (
              <div key={i} className="leading-relaxed"><Answer text={turn.content} /></div>
            ) : (
              <p key={i} className="text-slate-500" role="status">Thinking…</p>
            )
          )}
        </div>

        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">{error}</p>}
      </div>

      <form
        className="border-t border-slate-200 px-5 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <label htmlFor="ask-ai-question" className="sr-only">{started ? "Ask a follow-up question" : "What is unclear?"}</label>
        <div className="flex gap-2">
          <input
            id="ask-ai-question"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={600}
            autoComplete="off"
            placeholder={started ? "Ask a follow-up…" : "What is unclear? (or just press Ask)"}
            className="flex-1 min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
          <button type="submit" disabled={busy || (started && draft.trim() === "")} className={PRIMARY}>
            {busy ? "…" : "Ask"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{disclosure}</p>
      </form>
    </div>,
    document.body
  );
}
