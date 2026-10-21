"use client";
import { useActionState } from "react";
import { saveRootAction, type BuildFormState } from "@/app/build/actions";
import { ALERT, INPUT, SECONDARY } from "./styles";

/** Where new course folders are created. */
export default function RootForm({ root }: { root: string }) {
  const [state, action, pending] = useActionState(saveRootAction, { value: root } as BuildFormState);
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="build-root" className="block text-sm font-semibold text-slate-700">New courses are created in</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="build-root" name="root" required defaultValue={state.value ?? root} key={state.value ?? root} autoComplete="off" spellCheck={false} className={`${INPUT} flex-1 font-mono`} />
        <button type="submit" disabled={pending} className={SECONDARY}>{pending ? "Saving…" : "Change"}</button>
      </div>
      {state.error && <p role="alert" className={ALERT}>{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
    </form>
  );
}
