"use client";
import { useActionState } from "react";
import { setOutlineCourseAction, type BuildFormState } from "@/app/build/actions";
import { ALERT, INPUT, SECONDARY } from "./styles";

const INITIAL: BuildFormState = {};

/** Asks for the course code of an outline that does not state one. */
export default function OutlineCourseForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(setOutlineCourseAction, INITIAL);
  const inputId = `outline-course-${id}`;
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={inputId} className="block text-xs font-semibold text-amber-900">No course code was found in this outline. Which course is it?</label>
      <div className="flex flex-wrap gap-2">
        <input id={inputId} name="course" required defaultValue={state.value} key={state.value} placeholder="FIN 101" autoComplete="off" className={`${INPUT} w-32`} />
        <button type="submit" disabled={pending} className={SECONDARY}>{pending ? "Saving…" : "Set course"}</button>
      </div>
      {state.error && <p role="alert" className={ALERT}>{state.error}</p>}
    </form>
  );
}
