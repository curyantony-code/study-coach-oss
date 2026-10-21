import fs from "fs";
import os from "os";
import path from "path";
import { backUpNowAction, stopBackupsAction } from "@/app/backup/actions";
import FolderForm from "@/components/backup/FolderForm";
import RestoreForm from "@/components/backup/RestoreForm";
import { backupStatus, DAYS_KEPT, LATEST_FILE } from "@/lib/backup/auto";
import { summarise } from "@/lib/backup/snapshot";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const CARD = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
const H2 = "text-lg font-bold text-slate-900";
const PRIMARY = "inline-block rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
const SECONDARY = "rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

/** A Google Drive folder on this Mac, if the Drive app is installed, as a starting suggestion. */
function driveSuggestion(): string | null {
  try {
    const cloud = path.join(os.homedir(), "Library", "CloudStorage");
    const drive = fs.readdirSync(cloud).find((name) => name.startsWith("GoogleDrive-"));
    return drive ? path.join(cloud, drive, "My Drive") : null;
  } catch {
    return null;
  }
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "not yet";
}

export default function BackupPage() {
  const status = backupStatus();
  const now = summarise(getDb());

  return (
    <div className="max-w-3xl mx-auto animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold gradient-text mb-1">Backup</h1>
        <p className="text-slate-500 text-sm">
          Everything you have done in Study Coach lives in one file on this computer: {now.answers} answer{now.answers === 1 ? "" : "s"} across {now.vaults} course{now.vaults === 1 ? "" : "s"}, plus your schedules and settings.
          Your notes are not part of it; they stay in your vaults.
        </p>
      </header>

      <section aria-labelledby="backup-download" className={CARD}>
        <h2 id="backup-download" className={H2}>Download a backup</h2>
        <p className="mt-1 mb-4 text-sm text-slate-600">One file with all of your progress. Upload it to Google Drive, or keep it anywhere you like.</p>
        <a href="/api/backup/download" download className={PRIMARY}>Download backup file</a>
      </section>

      <section aria-labelledby="backup-auto" className={CARD}>
        <h2 id="backup-auto" className={H2}>Automatic copies to a cloud folder</h2>
        <p className="mt-1 mb-4 text-sm text-slate-600">
          Choose a folder that your cloud drive uploads by itself. While you study, Study Coach keeps “{LATEST_FILE}” there up to date (within about five minutes),
          plus one dated copy per day for the last {DAYS_KEPT} days.
        </p>
        {status.folder && (
          <div className={`mb-4 rounded-2xl border p-4 text-sm ${status.error ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
            <p className="font-semibold">{status.error ?? "Automatic copies are on."}</p>
            <p className="mt-1 break-all">Folder: {status.folder}</p>
            <p>Last copy: {when(status.last)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={backUpNowAction}><button type="submit" className={SECONDARY}>Copy now</button></form>
              <form action={stopBackupsAction}><button type="submit" className={SECONDARY}>Turn off</button></form>
            </div>
          </div>
        )}
        <FolderForm folder={status.folder} suggestion={driveSuggestion()} />
      </section>

      <section aria-labelledby="backup-restore" className={CARD}>
        <h2 id="backup-restore" className={H2}>Restore from a backup</h2>
        <p className="mt-1 mb-4 text-sm text-slate-600">On a new computer, or after something went wrong: choose a backup file to see what it holds before anything changes.</p>
        <RestoreForm />
      </section>
    </div>
  );
}
