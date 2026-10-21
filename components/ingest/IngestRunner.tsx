"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const PRIMARY = "rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
const SECONDARY = "rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

interface Progress {
  total: number;
  done: number;
  error?: string;
}

async function nextRound(file: string): Promise<Progress> {
  const response = await fetch("/api/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file }) });
  const json = (await response.json().catch(() => null)) as { success: boolean; data: Progress | null; error: string | null } | null;
  if (!json?.success || !json.data) throw new Error(json?.error ?? "That PDF could not be read. Try again.");
  return json.data;
}

/** Reads a PDF a few pages at a time, so progress shows and a long one can be stopped. */
export default function IngestRunner({ file, total, done }: { file: string; total: number; done: number }) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>({ total, done });
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const stop = useRef(false);
  // Leaving the page stops the run.
  useEffect(() => () => { stop.current = true; }, []);

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setMessage("");
    try {
      let current = progress;
      do {
        current = await nextRound(file);
        setProgress(current);
        if (current.error) {
          setMessage(current.error);
          break;
        }
      } while (!stop.current && current.done < current.total);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That PDF could not be read.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  };

  const started = progress.total > 0;
  const finished = started && progress.done >= progress.total;
  const percent = started ? Math.round((progress.done / progress.total) * 100) : 0;
  if (finished && !running) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {running
        ? <button type="button" className={SECONDARY} onClick={() => { stop.current = true; }}>Stop after these pages</button>
        : <button type="button" className={PRIMARY} onClick={() => void run()}>{started ? "Carry on reading" : "Read this PDF"}</button>}
      {started && (
        <div className="flex min-w-40 flex-1 items-center gap-2" role="status" aria-live="polite">
          <div className="h-1.5 flex-1 rounded-full bg-slate-200" aria-hidden="true"><div className="h-1.5 rounded-full bg-blue-500 transition-[width]" style={{ width: `${percent}%` }} /></div>
          <span className="text-xs tabular-nums text-slate-500">{progress.done} of {progress.total} pages</span>
        </div>
      )}
      {message && <p role="alert" className="basis-full text-sm text-rose-700">{message}</p>}
    </div>
  );
}
