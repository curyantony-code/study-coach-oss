"use client";
import { useRouter } from "next/navigation";
import { useSyncExternalStore, useState } from "react";

const PROGRESS_KEY = "study-coach-progress";
const KNOWN_KEY = "study-coach-known";
const DONE_KEY = "studycoach-legacy-imported";

function readJson(key: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasOldProgress(doneKey: string): boolean {
  if (localStorage.getItem(doneKey)) return false;
  return readJson(PROGRESS_KEY).length + readJson(KNOWN_KEY).length > 0;
}

const subscribe = () => () => {};

/** Offers, once, to bring progress from the original browser-only version of the app (kept in this browser) into the database. */
export default function LegacyImport({ vaultId, vaultName }: { vaultId: string; vaultName: string }) {
  const router = useRouter();
  // Remembered per vault: the old progress belongs to one course, and only that vault's cards match it.
  const doneKey = `${DONE_KEY}:${vaultId}`;
  const available = useSyncExternalStore(subscribe, () => hasOldProgress(doneKey), () => false);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!available && !message) return null;

  const run = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/study/import-legacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ known: readJson(KNOWN_KEY), progress: readJson(PROGRESS_KEY) }),
      });
      const body = await response.json();
      if (!body.success) throw new Error(body.error);
      if (body.data.imported === 0) {
        setMessage({ text: `None of the old progress matches the cards in ${vaultName}. Switch to the vault it came from and try there.`, failed: false });
        return;
      }
      localStorage.setItem(doneKey, new Date().toISOString());
      setMessage({ text: `Brought over progress for ${body.data.imported} cards into ${vaultName}.`, failed: false });
      router.refresh();
    } catch {
      setMessage({ text: "The old progress could not be brought over. Nothing was changed; you can try again.", failed: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 flex items-center justify-between gap-4 flex-wrap">
      {message ? (
        <p role={message.failed ? "alert" : "status"} className={`text-sm font-medium ${message.failed ? "text-rose-800" : "text-blue-900"}`}>{message.text}</p>
      ) : (
        <p className="text-sm text-blue-900">
          <span className="font-semibold">Progress from the old study app was found in this browser.</span> Bring it into {vaultName}?
        </p>
      )}
      {(!message || message.failed) && (
        <button type="button" onClick={run} disabled={busy}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500">
          {busy ? "Bringing it over…" : "Bring it over"}
        </button>
      )}
    </div>
  );
}
