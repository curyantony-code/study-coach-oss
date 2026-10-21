"use client";
import { useRef, useState } from "react";

interface Summary {
  vaults: number;
  answers: number;
  lastAnswer: string | null;
}

const SECONDARY = "rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const DANGER = "rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 active:bg-rose-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-rose-500";

function describe(summary: Summary): string {
  const last = summary.lastAnswer ? `, last studied ${new Date(summary.lastAnswer).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}` : "";
  return `${summary.vaults} course${summary.vaults === 1 ? "" : "s"}, ${summary.answers} answer${summary.answers === 1 ? "" : "s"}${last}`;
}

async function send(file: File, mode: "check" | "restore") {
  const body = new FormData();
  body.set("file", file);
  body.set("mode", mode);
  const response = await fetch("/api/backup/restore", { method: "POST", body });
  const json = (await response.json().catch(() => null)) as { success: boolean; data: Record<string, unknown> | null; error: string | null } | null;
  if (!json?.success || !json.data) throw new Error(json?.error ?? "That did not work. Try again.");
  return json.data;
}

/** Two steps on purpose: first see what the file holds next to what is here now, then confirm. */
export default function RestoreForm() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [found, setFound] = useState<{ backup: Summary; current: Summary } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);

  const choose = async (chosen: File | null) => {
    setFile(chosen);
    setFound(null);
    setMessage(null);
    if (!chosen) return;
    setBusy(true);
    try {
      setFound((await send(chosen, "check")) as unknown as { backup: Summary; current: Summary });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "That file could not be read.", bad: true });
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const done = (await send(file, "restore")) as unknown as { restored: Summary; safetyCopy: string };
      setMessage({ text: `Restored: ${describe(done.restored)}. What was here before is saved as data/backups/${done.safetyCopy}. Reloading…`, bad: false });
      setFound(null);
      setTimeout(() => window.location.assign("/"), 2500);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "The restore failed. Nothing was changed.", bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="backup-file" className="block text-sm font-semibold text-slate-800 mb-1">Backup file</label>
        <input ref={input} id="backup-file" type="file" accept=".db,application/vnd.sqlite3,application/octet-stream" disabled={busy}
          onChange={(event) => void choose(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-xl file:border file:border-slate-300 file:bg-white file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl" />
      </div>
      {found && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-slate-800">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="font-semibold">In this file</dt><dd>{describe(found.backup)}</dd>
            <dt className="font-semibold">In the app now</dt><dd>{describe(found.current)}</dd>
          </dl>
          <p className="mt-3">Restoring replaces what is in the app now with what is in the file. A copy of the current data is saved first, so this can be undone.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={DANGER} disabled={busy} onClick={() => void restore()}>{busy ? "Restoring…" : "Replace my data with this backup"}</button>
            <button type="button" className={SECONDARY} disabled={busy} onClick={() => { setFile(null); setFound(null); if (input.current) input.current.value = ""; }}>Cancel</button>
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className={`text-sm ${message?.bad ? "text-rose-700" : "text-emerald-700"}`}>{busy && !found ? "Reading the file…" : message?.text ?? ""}</p>
    </div>
  );
}
