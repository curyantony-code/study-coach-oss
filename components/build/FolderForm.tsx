"use client";
import { useActionState } from "react";
import { addFolderAction, type BuildFormState } from "@/app/build/actions";
import { ALERT, INPUT, SECONDARY } from "./styles";

const INITIAL: BuildFormState = {};

/** Adds a whole folder that is already on this computer, without copying it. */
export default function FolderForm() {
  const [state, action, pending] = useActionState(addFolderAction, INITIAL);
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="build-folder" className="block text-sm font-semibold text-slate-700">Or use a folder already on this computer</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="build-folder" name="path" required defaultValue={state.value} key={state.value} autoComplete="off" spellCheck={false} placeholder="~/Downloads/School" aria-describedby="build-folder-help" className={`${INPUT} flex-1 font-mono`} />
        <button type="submit" disabled={pending} className={SECONDARY}>{pending ? "Looking…" : "Add this folder"}</button>
      </div>
      <p id="build-folder-help" className="text-xs text-slate-500">The folder is only read. Nothing in it is moved, renamed or changed.</p>
      {state.error && <p role="alert" className={ALERT}>{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
    </form>
  );
}
