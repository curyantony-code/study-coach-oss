"use client";
import { useActionState } from "react";
import { saveOutlineAction, type OutlineState } from "@/app/problems/actions";

const INITIAL: OutlineState = {};

export default function OutlineForm({ outlineText, open }: { outlineText: string; open: boolean }) {
  const [state, action, pending] = useActionState(saveOutlineAction, INITIAL);
  return (
    <details open={open || Boolean(state.error)} className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <summary className="cursor-pointer select-none px-4 py-3 font-semibold text-slate-800 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        {outlineText ? "Edit the course outline list" : "Paste the assigned problems from your course outline"}
      </summary>
      <form action={action} className="px-4 pb-4 space-y-3">
        <label htmlFor="outline-text" className="block text-sm text-slate-600">
          One chapter per line, the way the outline writes it. This list is kept in Study Coach, not in your vault.
        </label>
        <textarea
          id="outline-text"
          name="outline"
          rows={8}
          key={state.value}
          defaultValue={state.value ?? outlineText}
          spellCheck={false}
          placeholder={"Chapter 5: 7; CFA problems 1 to 4\nChapter 6: 4 to 6, 13 to 19; CFA problems 1 to 3"}
          className="w-full rounded-xl border border-slate-300 bg-white font-mono text-xs leading-relaxed p-3 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <button type="submit" disabled={pending}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500">
            {pending ? "Saving…" : "Save outline"}
          </button>
          {state.saved && <span role="status" className="text-sm font-medium text-emerald-700">{state.saved}</span>}
        </div>
        {state.error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{state.error}</p>}
      </form>
    </details>
  );
}
