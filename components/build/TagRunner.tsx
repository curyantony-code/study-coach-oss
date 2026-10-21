"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ALERT, PRIMARY, SECONDARY, type Envelope } from "./styles";

interface Progress {
  total: number;
  done: number;
}

/** Tags the inbox a few files at a time, so progress shows and it can be stopped. */
export default function TagRunner({ total, done }: Progress) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>({ total, done });
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; }, []);
  // New uploads change the totals while this component stays mounted.
  useEffect(() => { if (!running) setProgress({ total, done }); }, [total, done, running]);

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setMessage("");
    try {
      let current = progress;
      do {
        const response = await fetch("/api/build/tag", { method: "POST" });
        const json = (await response.json().catch(() => null)) as Envelope<Progress> | null;
        if (!json?.success || !json.data) throw new Error(json?.error ?? "Tagging stopped. Try again.");
        // No progress in a whole round means something is stuck: stop rather than loop.
        if (json.data.done <= current.done && json.data.done < json.data.total) throw new Error("Tagging stopped making progress. Try again.");
        current = json.data;
        setProgress(current);
      } while (!stop.current && current.done < current.total);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tagging stopped. Try again.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  };

  const left = progress.total - progress.done;
  if (left <= 0 && !running) return null;
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {running
        ? <button type="button" className={SECONDARY} onClick={() => { stop.current = true; }}>Stop after this batch</button>
        : <button type="button" className={PRIMARY} onClick={() => void run()}>Tag {left} file{left === 1 ? "" : "s"}</button>}
      <div className="flex min-w-40 flex-1 items-center gap-2" role="status" aria-live="polite">
        <div className="h-1.5 flex-1 rounded-full bg-slate-200" aria-hidden="true"><div className="h-1.5 rounded-full bg-blue-500 transition-[width]" style={{ width: `${percent}%` }} /></div>
        <span className="text-xs tabular-nums text-slate-500">{progress.done} of {progress.total} tagged</span>
      </div>
      {message && <p role="alert" className={`${ALERT} basis-full`}>{message}</p>}
    </div>
  );
}
