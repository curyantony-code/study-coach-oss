"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ApiResponse } from "@/lib/api";
import type { WriteOutProgress } from "@/lib/problems/complete-service";

/** One round of writing. A plain request, so the rest of the page stays free while it runs. */
async function writeOutNext(): Promise<WriteOutProgress> {
  try {
    const response = await fetch("/api/problems/write-out", { method: "POST" });
    const body = (await response.json()) as ApiResponse<WriteOutProgress>;
    if (body.success && body.data) return body.data;
    return { written: 0, remaining: -1, error: body.error ?? "The questions could not be written out." };
  } catch {
    return { written: 0, remaining: -1, error: "Study Coach could not be reached." };
  }
}

interface Props {
  /** Problems still showing the notes' wording. */
  pending: number;
  /** Of those, how many cannot be answered as written. */
  unclear: number;
  total: number;
  providerLabel: string;
}

const BUTTON = "rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

/**
 * Works through every question that is still in the notes' wording, a few at a time, so the
 * whole vault ends up written out in full. Stops when asked, when done, or when the AI fails a round.
 */
export default function WriteOutAll({ pending, unclear, total, providerLabel }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(pending);
  const [message, setMessage] = useState("");
  const stop = useRef(false);
  // Leaving the page stops the run: it must not keep calling the AI unseen.
  useEffect(() => () => { stop.current = true; }, []);

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setMessage("");
    let remaining = left;
    let failedRounds = 0;
    while (!stop.current && remaining > 0) {
      const progress = await writeOutNext();
      // -1 means the round failed outright: keep the last known count.
      if (progress.remaining >= 0) {
        remaining = progress.remaining;
        setLeft(remaining);
      }
      if (progress.written === 0) {
        // One empty round can be a slow model; two in a row means the AI is not answering.
        if (++failedRounds >= 2) {
          setMessage(progress.error ? `${progress.error} Stopped; press the button to carry on later.` : "The AI stopped answering. Press the button to carry on later.");
          break;
        }
      } else {
        failedRounds = 0;
      }
    }
    setRunning(false);
    if (remaining === 0) setMessage("Every question is written out in full.");
    router.refresh();
  };

  if (pending === 0 && !message) return null;
  const written = total - left;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
      <p className="text-sm text-slate-700">
        <span className="font-semibold text-slate-900">{written} of {total} questions are written out in full.</span>{" "}
        {left > 0 && `${left} still use the short wording from your notes${unclear > 0 ? `, and ${unclear} of those cannot be answered as written` : ""}. Each one is written out when you open it; this does them all now.`}
      </p>
      {left > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {running ? (
            <button type="button" className={BUTTON} onClick={() => { stop.current = true; }}>Stop after this batch</button>
          ) : (
            <button type="button" className={BUTTON} onClick={run}>Write the rest out now (AI)</button>
          )}
          <span className="text-xs text-slate-500" role="status">
            {running ? `Working… ${left} to go. This takes a minute or two per batch of three; you can leave it running.` : `Sends each question and its solution to ${providerLabel}. Your notes are not changed.`}
          </span>
        </div>
      )}
      {message && <p role="status" className="mt-2 text-sm font-medium text-slate-700">{message}</p>}
    </div>
  );
}
