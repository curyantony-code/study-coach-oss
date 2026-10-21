"use client";
import { useActionState } from "react";
import { assignUnsortedAction, type BuildFormState } from "@/app/build/actions";
import { ALERT, INPUT, SECONDARY } from "./styles";

const INITIAL: BuildFormState = {};

/** One course for every file that has none: the quick fix when a whole batch is one course. */
export default function AssignAllForm({ count }: { count: number }) {
  const [state, action, pending] = useActionState(assignUnsortedAction, INITIAL);
  return (
    <form action={action} className="mt-3 space-y-2">
      <label htmlFor="build-assign-all" className="block text-xs font-semibold text-amber-900">Are all {count} from one course? Put them there in one go</label>
      <div className="flex flex-wrap gap-2">
        <input id="build-assign-all" name="course" required defaultValue={state.value} key={state.value} placeholder="FIN 101" autoComplete="off" className={`${INPUT} w-32`} />
        <button type="submit" disabled={pending} className={SECONDARY}>{pending ? "Moving…" : "Use this course for all"}</button>
      </div>
      {state.error && <p role="alert" className={ALERT}>{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
    </form>
  );
}
