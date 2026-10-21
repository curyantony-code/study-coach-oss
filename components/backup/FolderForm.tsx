"use client";
import { useActionState } from "react";
import { setFolderAction, type BackupFormState } from "@/app/backup/actions";

const FIELD = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const PRIMARY = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";

export default function FolderForm({ folder, suggestion }: { folder: string | null; suggestion: string | null }) {
  const [state, action, pending] = useActionState<BackupFormState, FormData>(setFolderAction, {});
  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="backup-folder" className="block text-sm font-semibold text-slate-800 mb-1">Folder for automatic copies</label>
        <input id="backup-folder" name="folder" type="text" key={state.value} defaultValue={state.value ?? folder ?? suggestion ?? ""} placeholder="/Users/you/Library/CloudStorage/GoogleDrive-you@gmail.com/My Drive/Study Coach" className={FIELD} aria-describedby="backup-folder-help" autoComplete="off" spellCheck={false} />
        <p id="backup-folder-help" className="mt-1 text-xs text-slate-500">
          The full path of a folder inside Google Drive, iCloud Drive or Dropbox on this computer. In Finder: right-click the folder, hold Option, choose “Copy as Pathname”, and paste it here.
        </p>
      </div>
      <button type="submit" disabled={pending} className={PRIMARY}>{pending ? "Saving…" : folder ? "Change folder" : "Turn on automatic copies"}</button>
      <p role="status" aria-live="polite" className={`text-sm ${state.error ? "text-rose-700" : "text-emerald-700"}`}>{state.error ?? state.saved ?? ""}</p>
    </form>
  );
}
