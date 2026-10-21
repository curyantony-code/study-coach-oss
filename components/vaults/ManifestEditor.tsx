"use client";
import { useActionState } from "react";
import { saveManifestAction, type FormState } from "@/app/vaults/actions";

const INITIAL: FormState = {};

interface Props {
  vaultId: string;
  initialYaml: string;
  /** True when the vault already has a study.yml that saving would replace. */
  replaces: boolean;
  writeEnabled: boolean;
}

export default function ManifestEditor({ vaultId, initialYaml, replaces, writeEnabled }: Props) {
  const [state, action, pending] = useActionState(saveManifestAction, INITIAL);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="vaultId" value={vaultId} />
      <label htmlFor="manifest-yaml" className="sr-only">
        study.yml contents
      </label>
      <textarea
        id="manifest-yaml"
        name="yaml"
        defaultValue={state.value ?? initialYaml}
        key={state.value}
        rows={18}
        spellCheck={false}
        className="w-full rounded-xl border border-slate-300 bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      />
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="confirm" disabled={!writeEnabled} className="mt-0.5 h-4 w-4 accent-blue-600" />
        <span>
          {replaces
            ? "Yes, replace the study.yml in my vault with this text."
            : "Yes, create study.yml in my vault with this text."}
        </span>
      </label>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          disabled={pending || !writeEnabled}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
        >
          {pending ? "Saving…" : "Save to vault"}
        </button>
        {!writeEnabled && <span className="text-sm text-slate-500">Turn on “Allow writing” above to save.</span>}
        {state.saved && (
          <span role="status" className="text-sm font-medium text-emerald-700">
            Saved. The vault was re-read with the new settings.
          </span>
        )}
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}
    </form>
  );
}
