"use client";
import { useActionState } from "react";
import { addVaultAction, type FormState } from "@/app/vaults/actions";

const INITIAL: FormState = {};

export default function AddVaultForm() {
  const [state, action, pending] = useActionState(addVaultAction, INITIAL);
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="vault-path" className="block text-sm font-semibold text-slate-700">
        Folder path
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id="vault-path"
          name="path"
          required
          defaultValue={state.value}
          key={state.value}
          autoComplete="off"
          spellCheck={false}
          placeholder="~/Documents/My Vault"
          aria-describedby="vault-path-help"
          className="flex-1 min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
        >
          {pending ? "Adding…" : "Add vault"}
        </button>
      </div>
      <p id="vault-path-help" className="text-xs text-slate-500">
        In Finder, right-click the vault folder, hold Option, and choose “Copy as Pathname”. Then paste it here.
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}
    </form>
  );
}
