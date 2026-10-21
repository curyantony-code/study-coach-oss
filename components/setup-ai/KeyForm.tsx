"use client";
import { useActionState } from "react";
import { saveKeyAction, type KeyFormState } from "@/app/setup-ai/actions";

const FIELD = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const PRIMARY = "shrink-0 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";

interface Props {
  name: string;
  label: string;
  startsWith: string;
  /** True when a key is already saved: the button then replaces it. */
  hasKey: boolean;
}

export default function KeyForm({ name, label, startsWith, hasKey }: Props) {
  const [state, action, pending] = useActionState<KeyFormState, FormData>(saveKeyAction, {});
  const inputId = `key-${name}`;
  return (
    <form action={action} className="space-y-2" data-testid={`form-${name}`}>
      <input type="hidden" name="name" value={name} />
      <label htmlFor={inputId} className="block text-sm font-semibold text-slate-800">
        {hasKey ? `Paste a new ${label} key to replace the saved one` : `Paste your ${label} key here`}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id={inputId} name="key" type="password" required placeholder={`${startsWith}…`} className={FIELD} autoComplete="off" spellCheck={false} aria-describedby={`${inputId}-status`} />
        <button type="submit" disabled={pending} className={PRIMARY}>{pending ? "Trying the key…" : "Save"}</button>
      </div>
      <div id={`${inputId}-status`} role="status" aria-live="polite" className="text-sm">
        {state.error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">{state.error}</p>}
        {state.saved && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">{state.saved}</p>}
        {state.note && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">{state.note}</p>}
      </div>
    </form>
  );
}
