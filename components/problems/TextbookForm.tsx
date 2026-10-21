"use client";
import { useActionState } from "react";
import { importTextbookAction, type TextbookState } from "@/app/problems/actions";

const INITIAL: TextbookState = {};

interface Props {
  pdfs: string[];
  /** The file the current wording came from, if any. */
  importedFile: string | null;
  /** How many of this vault's problems now show the textbook's wording. */
  matched: number;
  total: number;
  open: boolean;
}

export default function TextbookForm({ pdfs, importedFile, matched, total, open }: Props) {
  const [state, action, pending] = useActionState(importTextbookAction, INITIAL);
  return (
    <details open={open || Boolean(state.error)} className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <summary className="cursor-pointer select-none px-4 py-3 font-semibold text-slate-800 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        {importedFile ? `Full question wording: ${matched} of ${total} problems` : "Show the textbook’s full question wording"}
      </summary>
      <form action={action} className="px-4 pb-4 space-y-3">
        <p className="text-sm text-slate-600">
          Your notes summarise each problem. Pick the textbook’s problem-set PDF from this vault and Study Coach will show the full original question
          (with any shared data) instead. The PDF is only read, and nothing is written to your vault.
        </p>
        {pdfs.length === 0 ? (
          <p className="text-sm text-slate-500">No PDFs were found in this vault.</p>
        ) : (
          <>
            <label htmlFor="textbook-file" className="block text-sm font-semibold text-slate-800">PDF with the problem sets</label>
            <select id="textbook-file" name="file" defaultValue={importedFile ?? pdfs[0]}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              {pdfs.map((pdf) => <option key={pdf} value={pdf}>{pdf}</option>)}
            </select>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" name="intent" value="import" disabled={pending}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500">
                {pending ? "Reading the PDF…" : importedFile ? "Read it again" : "Read the questions from this PDF"}
              </button>
              {importedFile && (
                <button type="submit" name="intent" value="remove" disabled={pending}
                  className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  Go back to my notes’ wording
                </button>
              )}
              {state.saved && <span role="status" className="text-sm font-medium text-emerald-700">{state.saved}</span>}
            </div>
          </>
        )}
        {state.error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{state.error}</p>}
      </form>
    </details>
  );
}
