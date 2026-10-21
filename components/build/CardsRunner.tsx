"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ALERT, PRIMARY, SECONDARY, type Envelope } from "./styles";

interface Progress {
  total: number;
  done: number;
  cards: number;
  empty: number;
}

interface Step {
  progress: Progress;
  note: string | null;
  path: string | null;
  problem?: string;
  added: number;
  dropped: number;
}

/** Writes study cards into a built course, one note at a time. Nothing is written until the button is pressed. */
export default function CardsRunner({ vaultId, course, initial }: { vaultId: string; course: string; initial: Progress }) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState("");
  const [message, setMessage] = useState("");
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; }, []);

  const run = async (again: boolean) => {
    stop.current = false;
    setRunning(true);
    setMessage("");
    // Notes tried in this run: one that comes back empty again is not asked for a third time.
    const tried: string[] = [];
    try {
      for (;;) {
        const response = await fetch("/api/build/cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vaultId, again, skip: tried }) });
        const json = (await response.json().catch(() => null)) as Envelope<Step> | null;
        if (!json?.success || !json.data) throw new Error(json?.error ?? "Writing cards stopped. Try again.");
        setProgress(json.data.progress);
        if (json.data.note === null || json.data.path === null) break;
        tried.push(json.data.path);
        setLast(json.data.problem ? `${json.data.note}: ${json.data.problem}` : json.data.added > 0
          ? `${json.data.note}: ${json.data.added} card${json.data.added === 1 ? "" : "s"} written${json.data.dropped > 0 ? `, ${json.data.dropped} left out by the checks` : ""}.`
          : `${json.data.note}: nothing usable came back, so the note was left as it is.`);
        if (stop.current) break;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Writing cards stopped. Try again.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  };

  const left = progress.total - progress.done;
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {running
          ? <button type="button" className={SECONDARY} onClick={() => { stop.current = true; }}>Stop after this note</button>
          : left > 0
            ? <button type="button" className={PRIMARY} onClick={() => void run(false)}>Write study cards for {course} ({left} note{left === 1 ? "" : "s"})</button>
            : progress.empty > 0
              ? <button type="button" className={SECONDARY} onClick={() => void run(true)}>Try the {progress.empty} empty note{progress.empty === 1 ? "" : "s"} again</button>
              : null}
        {progress.total > 0 && (
          <div className="flex min-w-40 flex-1 items-center gap-2" role="status" aria-live="polite">
            <div className="h-1.5 flex-1 rounded-full bg-slate-200" aria-hidden="true"><div className="h-1.5 rounded-full bg-blue-500 transition-[width]" style={{ width: `${percent}%` }} /></div>
            <span className="text-xs tabular-nums text-slate-500">{progress.done} of {progress.total} notes · {progress.cards} cards</span>
          </div>
        )}
      </div>
      {last && <p role="status" aria-live="polite" className="break-words text-xs text-slate-600">{last}</p>}
      {message && <p role="alert" className={ALERT}>{message}</p>}
    </div>
  );
}
