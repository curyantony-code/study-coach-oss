"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Throws away what was read from a PDF, so it can be read afresh. The PDF itself is never touched. */
export default function ReadAgainButton({ file }: { file: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const forget = async () => {
    if (!window.confirm("Discard what was read from this PDF and start again? Your PDF is not changed.")) return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file, action: "forget" }) });
      if (!response.ok) throw new Error("not forgotten");
      router.push("/ingest");
      router.refresh();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <span>
      <button type="button" onClick={() => void forget()} disabled={busy}
        className="text-sm font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900 rounded disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        {busy ? "Discarding…" : "Read it again from scratch"}
      </button>
      {failed && <span role="alert" className="ml-2 text-sm text-rose-700">That did not work. Try again.</span>}
    </span>
  );
}
