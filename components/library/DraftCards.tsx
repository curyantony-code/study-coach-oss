"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { saveDraftsAction, type FormState } from "@/app/vaults/actions";
import type { ApiResponse } from "@/lib/api";

const INITIAL: FormState = {};
const PRIMARY = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
const SECONDARY = "rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

interface Props {
  slug: string;
  cardCount: number;
  writeEnabled: boolean;
  vaultHref: string;
  providerLabel: string;
}

/** Lets the owner have the AI propose study cards for a note, review and edit them, then save them to `_study-drafts/`. */
export default function DraftCards({ slug, cardCount, writeEnabled, vaultHref, providerLabel }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [state, action, pending] = useActionState(saveDraftsAction, INITIAL);

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
      const body = (await response.json()) as ApiResponse<{ count: number; file: string }>;
      if (!body.success || !body.data) throw new Error(body.error ?? "Cards could not be drafted just now.");
      setDraft(body.data.file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cards could not be drafted just now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="draft-cards" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mt-6">
      <h2 id="draft-cards" className="text-base font-bold text-slate-900 mb-1">Draft study cards with AI</h2>
      <p className="text-sm text-slate-500 mb-3">
        This note makes {cardCount} card{cardCount === 1 ? "" : "s"} on its own. The AI can propose more from the note’s text (sent to {providerLabel}). Nothing is
        saved until you have reviewed it, and drafts go to a separate <code className="rounded bg-slate-100 px-1">_study-drafts</code> folder, never into your note.
      </p>

      {draft === null ? (
        <button type="button" className={SECONDARY} disabled={busy} onClick={generate}>{busy ? "Drafting… (this can take half a minute)" : "Draft cards"}</button>
      ) : state.saved ? (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Saved to <code className="rounded bg-white px-1">{state.value}</code> in your vault. Open it in Obsidian, keep the cards you want, and move them into the note to start studying them.
        </p>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <label htmlFor="draft-content" className="block text-sm font-semibold text-slate-800">Review and edit before saving</label>
          <textarea id="draft-content" name="content" rows={14} key={state.value} defaultValue={state.value ?? draft} spellCheck={false}
            className="w-full rounded-xl border border-slate-300 bg-white font-mono text-xs leading-relaxed p-3 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" name="confirm" disabled={!writeEnabled} className="mt-0.5 h-4 w-4 accent-blue-600" />
            <span>Yes, save these drafts into the <code className="rounded bg-slate-100 px-1">_study-drafts</code> folder of my vault.</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={PRIMARY} disabled={pending || !writeEnabled}>{pending ? "Saving…" : "Save drafts to vault"}</button>
            <button type="button" className={SECONDARY} disabled={busy} onClick={generate}>{busy ? "Drafting…" : "Draft again"}</button>
            {!writeEnabled && (
              <span className="text-sm text-slate-500">
                Writing is off for this vault. <Link href={vaultHref} className="font-semibold text-blue-700 underline underline-offset-2">Turn it on</Link>, or copy the text above.
              </span>
            )}
          </div>
          {state.error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{state.error}</p>}
        </form>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    </section>
  );
}
