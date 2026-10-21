"use client";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { ALERT, PRIMARY, type Envelope } from "./styles";

/** Must match CHUNK_BYTES in lib/build/inbox.ts: the server refuses larger pieces. */
const CHUNK_BYTES = 4 * 1024 * 1024;
const ACCEPT = ".pdf,.pptx,.ppt,.docx,.doc,.md,.markdown,.txt,.xlsx,.xlsm,.xls,.csv,.png,.jpg,.jpeg,.key,.pages";

interface Piece {
  id: string;
  received: number;
  done: boolean;
}

interface Target {
  /** The course these files are for, when the student has said. */
  course?: string;
  /** Set when the files are course outlines. */
  role?: "outline";
}

async function sendFile(file: File, target: Target, onProgress: (sent: number) => void): Promise<void> {
  let id: string | null = null;
  for (let offset = 0; offset < file.size; ) {
    const chunk = file.slice(offset, offset + CHUNK_BYTES);
    const query = new URLSearchParams({ name: file.name, offset: String(offset), total: String(file.size), ...(id ? { id } : {}), ...(target.course ? { course: target.course } : {}), ...(target.role ? { role: target.role } : {}) });
    const response = await fetch(`/api/build/upload?${query}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: chunk });
    const json = (await response.json().catch(() => null)) as Envelope<Piece> | null;
    if (!json?.success || !json.data) throw new Error(json?.error ?? "That file could not be added.");
    id = json.data.id;
    offset = json.data.received;
    onProgress(offset);
  }
}

/** Drop files here, or pick them. Each one is copied into Study Coach's own folder on this computer. */
export default function Uploader({ course, role, prompt, hint, button = "Choose files" }: Target & { prompt: string; hint?: string; button?: string }) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [problems, setProblems] = useState<string[]>([]);

  const add = async (list: FileList | null) => {
    const files = [...(list ?? [])].filter((file) => file.size > 0);
    if (files.length === 0 || busy) return;
    setBusy(true);
    setProblems([]);
    const failed: string[] = [];
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let finishedBytes = 0;
    for (const [at, file] of files.entries()) {
      try {
        await sendFile(file, { course, role }, (sent) => setStatus(`Adding ${at + 1} of ${files.length}: ${file.name} (${Math.round(((finishedBytes + sent) / totalBytes) * 100)}%)`));
      } catch (error) {
        failed.push(`${file.name}: ${error instanceof Error ? error.message : "could not be added."}`);
      }
      finishedBytes += file.size;
    }
    setStatus(`${files.length - failed.length} file${files.length - failed.length === 1 ? "" : "s"} added.`);
    setProblems(failed);
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  };

  return (
    <div>
      <div
        onDragOver={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => { event.preventDefault(); setOver(false); void add(event.dataTransfer.files); }}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${over ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50"}`}
      >
        <p className="text-sm text-slate-600">{prompt}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        <input ref={input} id={inputId} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(event) => void add(event.target.files)} />
        <label htmlFor={inputId} className={`${PRIMARY} mt-4 inline-block cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy ? "Adding…" : button}
        </label>
      </div>
      {status && <p role="status" aria-live="polite" className="mt-2 text-xs text-slate-500 break-words">{status}</p>}
      {problems.length > 0 && (
        <ul role="alert" className={`${ALERT} mt-2 list-disc pl-6`}>
          {problems.map((problem) => <li key={problem} className="break-words">{problem}</li>)}
        </ul>
      )}
    </div>
  );
}
