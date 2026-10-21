"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import MathText from "@/components/MathText";
import CardHelp from "@/components/study/CardHelp";
import ConfidencePicker, { CONFIDENCE_KEYS } from "@/components/study/ConfidencePicker";
import SessionSummary, { type SessionResult } from "@/components/study/SessionSummary";
import SleepCheckin from "@/components/study/SleepCheckin";
import type { ApiResponse } from "@/lib/api";
import type { HintLevel } from "@/lib/learner/hints";
import type { QueueReason } from "@/lib/learner/queue";
import { DISTRACTOR_COUNT, pickDistractors, shuffle, type AskKind, type SessionMode } from "@/lib/learner/session";
import type { Confidence, StudyMode } from "@/lib/learner/types";
import { logAttempt } from "@/lib/study-client";

interface QueueCard {
  id: string;
  front: string;
  back: string;
  nodeTitle: string;
  nodeSlug: string | null;
  reason: QueueReason;
  kind: AskKind;
  hint: string | null;
  hintLevel: HintLevel;
}

interface QueueData {
  scopeLabel: string;
  scopeSize: number;
  needsCheckin: boolean;
  reviewOnly: boolean;
  focusNudge: boolean;
  items: QueueCard[];
  distractors: string[];
}

interface SessionItem {
  card: QueueCard;
  kind: AskKind;
  options: string[];
  /** A re-ask of a card missed earlier in this session: practice only, not recorded. */
  retry: boolean;
  /** How many times this card has already been re-asked. */
  retries: number;
}

type Step = "ask" | "revealed" | "feedback";
type Status = "loading" | "failed" | "checkin" | "running" | "done";

const REASON_LABEL: Record<QueueReason, string> = {
  fix: "You were sure about this one last time, and it was wrong",
  due: "Due for review",
  new: "New card",
  extra: "Extra practice",
};

/** A missed card comes back this many times at most, so a session always ends. */
const MAX_RETRIES = 2;

function studyModeFor(kind: AskKind, mode: SessionMode): StudyMode {
  if (kind === "guess") return "guess-first";
  if (mode === "flashcards") return "flashcards";
  if (mode === "quiz") return "quiz";
  return kind === "choice" ? "smart-choice" : "smart-recall";
}

function willRequeue(item: SessionItem, correct: boolean): boolean {
  return !correct && item.retries < MAX_RETRIES;
}

function toItem(card: QueueCard, pool: string[]): SessionItem {
  const distractors = card.kind === "choice" ? pickDistractors(card.back, pool) : [];
  // The server plans multiple choice only when the scope has enough other answers; double-check here.
  const kind = card.kind === "choice" && distractors.length < DISTRACTOR_COUNT ? "recall" : card.kind;
  return { card, kind, options: kind === "choice" ? shuffle([card.back, ...distractors]) : [], retry: false, retries: 0 };
}

const PRIMARY = "rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
const SECONDARY = "rounded-xl border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";

export default function StudySession({ scope, mode, size, providerLabel }: { scope: string; mode: SessionMode; size: number; providerLabel: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [data, setData] = useState<QueueData | null>(null);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [position, setPosition] = useState(0);
  const [step, setStep] = useState<Step>("ask");
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [guess, setGuess] = useState("");
  const [hintShown, setHintShown] = useState(false);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [timesAway, setTimesAway] = useState(0);
  const [round, setRound] = useState(0);
  const shownAt = useRef(0);
  /** True once the tab was hidden while the current card was on screen. */
  const leftDuringCard = useRef(false);
  /** Saves still on their way to the database. */
  const pendingSaves = useRef<Promise<unknown>[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/study/queue?${new URLSearchParams({ scope, mode, limit: String(size) })}`)
      .then((r) => r.json() as Promise<ApiResponse<QueueData>>)
      .then((body) => {
        if (cancelled) return;
        if (!body.success || !body.data) {
          setError(body.error ?? "The session could not be loaded.");
          setStatus("failed");
          return;
        }
        setData(body.data);
        setItems(body.data.items.map((card) => toItem(card, body.data!.distractors)));
        setPosition(0);
        setResults([]);
        setTimesAway(0);
        setStep("ask");
        setConfidence(null);
        setPicked(null);
        setGuess("");
        setHintShown(false);
        shownAt.current = Date.now();
        leftDuringCard.current = false;
        setStatus(body.data.needsCheckin && body.data.items.length > 0 ? "checkin" : "running");
      })
      .catch(() => {
        if (cancelled) return;
        setError("The session could not be loaded. Check that Study Coach is still running.");
        setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [scope, mode, size, round]);

  // Focus: notice when the student leaves the tab mid-card (docs/ARCHITECTURE.md).
  useEffect(() => {
    if (status !== "running") return;
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      leftDuringCard.current = true;
      setTimesAway((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [status]);

  const current = status === "running" ? items[position] : undefined;

  /** `requeued` is 1 when this same click also sent the card to the back of the line. */
  const advance = useCallback(
    (requeued = 0) => {
      setConfidence(null);
      setPicked(null);
      setGuess("");
      setHintShown(false);
      setStep("ask");
      shownAt.current = Date.now();
      leftDuringCard.current = false;
      if (position + 1 >= items.length + requeued) setStatus("done");
      setPosition(position + 1);
    },
    [items.length, position]
  );

  /** Records the first answer to a card; a miss sends the card to the back of the line. */
  const settle = useCallback(
    (item: SessionItem, correct: boolean) => {
      if (!item.retry) {
        setResults((r) => [...r, { cardId: item.card.id, front: item.card.front, back: item.card.back, correct, confidentMiss: !correct && confidence === "certain" }]);
        const hintSeen = Boolean(item.card.hint) && item.kind !== "guess" && (item.card.hintLevel === "full" || hintShown);
        const save = logAttempt({
          cardId: item.card.id,
          scope,
          mode: studyModeFor(item.kind, mode),
          correct,
          confidence,
          responseMs: Date.now() - shownAt.current,
          hintUsed: hintSeen,
          distracted: leftDuringCard.current,
          guessedFirst: item.kind === "guess",
        }).then((saved) => {
          if (!saved) setSaveFailed(true);
        });
        pendingSaves.current.push(save);
      }
      if (willRequeue(item, correct)) {
        // A guessed card comes back as plain recall: by then the answer has been seen.
        const kind = item.kind === "guess" ? "recall" : item.kind;
        setItems((all) => [...all, { ...item, kind, retry: true, retries: item.retries + 1, options: shuffle(item.options) }]);
      }
    },
    [confidence, hintShown, mode, scope]
  );

  const reveal = useCallback(() => setStep("revealed"), []);

  const selfMark = useCallback(
    (correct: boolean) => {
      if (!current) return;
      settle(current, correct);
      advance(willRequeue(current, correct) ? 1 : 0);
    },
    [advance, current, settle]
  );

  const choose = useCallback(
    (option: string) => {
      if (!current || step !== "ask") return;
      setPicked(option);
      settle(current, option === current.card.back);
      setStep("feedback");
    },
    [current, settle, step]
  );

  // A guess is not rated for confidence: it is expected to be uncertain.
  const asksConfidence = Boolean(current && !current.retry && current.kind !== "guess");
  const needsConfidence = asksConfidence && confidence === null;

  useEffect(() => {
    if (!current) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // While the Ask AI chat is open, keys belong to it.
      if (document.querySelector("[data-ask-panel]")) return;
      // Typing a guess must not trigger shortcuts.
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      const key = event.key.toLowerCase();
      if (typing) {
        if (key === "enter" && !event.shiftKey && step === "ask" && current.kind === "guess") {
          event.preventDefault();
          reveal();
        }
        return;
      }
      if (step === "ask" && needsConfidence && CONFIDENCE_KEYS[key]) return setConfidence(CONFIDENCE_KEYS[key]);
      if (step === "ask" && !needsConfidence && current.kind === "choice") {
        const option = current.options["abcd".indexOf(key)];
        if (option) choose(option);
        return;
      }
      if (step === "ask" && !needsConfidence && current.kind !== "choice" && (key === "enter" || key === " ")) {
        event.preventDefault();
        return reveal();
      }
      if (step === "revealed" && key === "m") return selfMark(false);
      if (step === "revealed" && key === "g") return selfMark(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, current, needsConfidence, reveal, selfMark, step]);

  if (status === "loading") return <p className="text-center py-20 text-slate-500" role="status">Loading your session…</p>;
  if (status === "failed") {
    return (
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
        <p className="font-semibold mb-3">{error}</p>
        <Link href="/study" className={SECONDARY}>Back to Study</Link>
      </div>
    );
  }
  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h2 className="text-xl font-bold text-slate-900 mb-2">{data?.reviewOnly ? "Nothing to review yet" : "Nothing to study here yet"}</h2>
        <p className="text-slate-600 mb-5">
          {data?.reviewOnly
            ? "After a short night Study Coach only reviews what you have already studied, and nothing here is started yet. Try again after some sleep, or pick something you have studied before."
            : `No cards could be made from “${data?.scopeLabel}”. Pick something else, or check the vault’s health page.`}
        </p>
        <Link href="/study" className={PRIMARY}>Back to Study</Link>
      </div>
    );
  }
  if (status === "checkin") {
    // The answer can change the queue (review only after a short night), so load it again.
    const start = (planChanged: boolean) => {
      if (planChanged) return setRound((r) => r + 1);
      // Time on the first card starts now, not while the check-in was showing.
      shownAt.current = Date.now();
      setStatus("running");
    };
    return <SleepCheckin onDone={start} />;
  }
  if (status === "done" || !current) {
    // The next round's queue depends on this round's answers, so wait until they are all saved.
    const again = async () => {
      setFinishing(true);
      await Promise.allSettled(pendingSaves.current);
      pendingSaves.current = [];
      setFinishing(false);
      setStatus("loading");
      setRound((r) => r + 1);
    };
    return <SessionSummary results={results} scopeLabel={data.scopeLabel} onAgain={again} busy={finishing} timesAway={timesAway} />;
  }

  const firstPassTotal = data.items.length;
  // Count from the queue position, not from answers, so the number does not jump while feedback shows.
  const firstPassDone = Math.min(position, firstPassTotal);
  const answered = Math.min(results.length, firstPassTotal);
  const isRight = picked === current.card.back;
  const { hint, hintLevel } = current.card;
  // A guess is meant to be unaided, so hints only accompany recall and multiple choice.
  const canHint = Boolean(hint) && !current.retry && current.kind !== "guess" && step === "ask";
  const hintVisible = canHint && (hintLevel === "full" || hintShown);
  const hintOffered = canHint && hintLevel === "light" && !hintShown;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between gap-3 mb-2 text-sm">
        <span className="font-semibold text-slate-700">{data.scopeLabel}</span>
        <span className="text-slate-500 tabular-nums">{current.retry ? "Second try" : `${firstPassDone + 1} of ${firstPassTotal}`}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 mb-6" role="progressbar" aria-valuemin={0} aria-valuemax={firstPassTotal} aria-valuenow={answered} aria-label="Session progress">
        <div className="h-2 rounded-full bg-blue-500 origin-left transition-transform duration-300" style={{ transform: `scaleX(${answered / firstPassTotal})` }} />
      </div>

      {position === 0 && step === "ask" && (data.reviewOnly || data.focusNudge) && (
        <ul className="mb-4 space-y-1 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">
          {data.reviewOnly && <li>Short night: this session is review only. New material waits until you have slept.</li>}
          {data.focusNudge && <li>Before you start: phone in another room, notifications off. It makes a real difference to what sticks.</li>}
        </ul>
      )}

      {saveFailed && (
        <p role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          An answer could not be saved. You can keep going, but that card’s progress was not recorded.
        </p>
      )}

      <article className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">{current.card.nodeTitle}</p>
        <p className={`text-xs font-semibold mb-4 ${current.card.reason === "fix" ? "text-rose-700" : "text-slate-500"}`}>
          {current.retry ? "Missed a moment ago: try it again" : current.kind === "guess" ? "New card: take a guess first" : REASON_LABEL[current.card.reason]}
        </p>
        {/* A full textbook question runs to several lines: keep its line breaks and ease the size. */}
        <h2 className={`font-bold text-slate-900 mb-6 whitespace-pre-line ${current.card.front.length > 220 ? "text-base leading-relaxed" : "text-xl sm:text-2xl leading-snug"}`}>
          <MathText text={current.card.front} />
        </h2>

        {hintVisible && (
          <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="font-semibold">Hint: </span><MathText text={hint!} />
          </p>
        )}
        {hintOffered && (
          <button type="button" onClick={() => setHintShown(true)}
            className="mb-5 block text-sm font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-950 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
            Show a hint
          </button>
        )}

        {asksConfidence && step === "ask" && <ConfidencePicker value={confidence} onChange={setConfidence} />}

        {current.kind === "guess" && step === "ask" && (
          <div>
            <label htmlFor="guess-input" className="block text-sm font-semibold text-slate-700 mb-1">Your best guess</label>
            <p className="text-sm text-slate-500 mb-2">You have not studied this yet. Guessing first, even wrongly, helps the answer stick.</p>
            <textarea
              id="guess-input"
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              rows={2}
              placeholder="Type a guess, or say it out loud"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            <button type="button" className={`${PRIMARY} mt-3`} onClick={reveal}>Show answer</button>
          </div>
        )}

        {current.kind === "recall" && step === "ask" && (
          <div className="mt-5">
            <p className="text-sm text-slate-500 mb-3">Say the answer in your head or out loud first.</p>
            <button type="button" className={PRIMARY} disabled={needsConfidence} onClick={reveal}>Show answer</button>
          </div>
        )}

        {current.kind !== "choice" && step === "revealed" && (
          <div aria-live="polite">
            {current.kind === "guess" && guess.trim() !== "" && (
              <div className="rounded-2xl border border-slate-200 p-4 mb-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">Your guess</p>
                <p className="text-slate-700 whitespace-pre-line">{guess}</p>
              </div>
            )}
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 mb-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">Answer</p>
              <p className="text-slate-900 whitespace-pre-line"><MathText text={current.card.back} /></p>
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-2">{current.kind === "guess" ? "Was your guess right?" : "Did you have it?"}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={SECONDARY} onClick={() => selfMark(false)}>
                {current.kind === "guess" ? "Not quite" : "Missed it"} <kbd className="ml-1 hidden sm:inline text-xs font-mono text-slate-400">M</kbd>
              </button>
              <button type="button" className={PRIMARY} onClick={() => selfMark(true)}>
                Got it <kbd className="ml-1 hidden sm:inline text-xs font-mono text-blue-100">G</kbd>
              </button>
            </div>
          </div>
        )}

        {current.kind === "choice" && (
          <ol className="mt-5 space-y-2" aria-label="Answer options">
            {current.options.map((option, i) => {
              const isAnswer = option === current.card.back;
              const state = step !== "feedback" ? "idle" : isAnswer ? "right" : option === picked ? "wrong" : "dim";
              const look = {
                idle: "border-slate-200 bg-white text-slate-800 hover:border-blue-400 hover:bg-blue-50 active:bg-blue-100",
                right: "border-emerald-500 bg-emerald-50 text-emerald-950",
                wrong: "border-rose-500 bg-rose-50 text-rose-950",
                dim: "border-slate-200 bg-white text-slate-400",
              }[state];
              return (
                <li key={option}>
                  <button
                    type="button"
                    disabled={needsConfidence || step === "feedback"}
                    onClick={() => choose(option)}
                    className={`w-full text-left rounded-xl border-2 px-4 py-3 text-sm transition-colors disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 ${look} ${needsConfidence ? "opacity-60" : ""}`}
                  >
                    <span className="font-mono font-bold mr-2 text-slate-400">{"ABCD"[i]}</span>
                    <MathText text={option} />
                    {state === "right" && <span className="ml-2 font-semibold">✓ Correct answer</span>}
                    {state === "wrong" && <span className="ml-2 font-semibold">✗ Your answer</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {current.kind === "choice" && step === "ask" && needsConfidence && (
          <p className="mt-3 text-sm text-slate-500">Choose how sure you are to unlock the options.</p>
        )}

        {current.kind === "choice" && step === "feedback" && (
          <div aria-live="polite" className="mt-5">
            <p className={`text-sm font-semibold mb-3 ${isRight ? "text-emerald-700" : "text-rose-700"}`}>
              {isRight
                ? "Correct."
                : confidence === "certain" && !current.retry
                  ? "A confident miss. This one comes back first next time."
                  : willRequeue(current, false)
                    ? "Not quite. It will come back at the end of this session."
                    : "Not quite. It is scheduled to come back soon."}
            </p>
            <button type="button" className={PRIMARY} onClick={() => advance()} autoFocus>Next</button>
          </div>
        )}
      </article>

      {/* Only once the answer is showing: before that it would give the answer away. */}
      {step !== "ask" && current.card.nodeSlug && (
        <CardHelp
          key={`${current.card.id}:${position}`}
          cardId={current.card.id}
          nodeSlug={current.card.nodeSlug}
          front={current.card.front}
          back={current.card.back}
          providerLabel={providerLabel}
        />
      )}

      <p className="mt-4 text-xs text-slate-400 hidden sm:block">
        Keyboard: {current.kind === "guess" ? "type a guess, Enter to show the answer" : "1–3 for confidence"}
        {current.kind === "choice" ? ", A–D to answer, Enter for next" : current.kind === "recall" ? ", Enter to show the answer" : ""}
        {current.kind !== "choice" ? ", M missed, G got it" : ""}.
      </p>
    </div>
  );
}
