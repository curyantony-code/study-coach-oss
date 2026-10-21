"use server";

import { revalidatePath } from "next/cache";
import { backUpNow, clearBackupFolder, setBackupFolder } from "@/lib/backup/auto";

export interface BackupFormState {
  error?: string;
  saved?: string;
  /** What was typed, handed back so a refused folder can be corrected rather than retyped. */
  value?: string;
}

/** Sets the folder that receives automatic copies, and writes the first copy straight away. */
export async function setFolderAction(_prev: BackupFormState, formData: FormData): Promise<BackupFormState> {
  const typed = String(formData.get("folder") ?? "").slice(0, 1000);
  const check = setBackupFolder(typed);
  if (!check.ok) return { error: check.error, value: typed };
  const failed = backUpNow();
  revalidatePath("/backup");
  return failed ? { error: failed } : { saved: `Saved. A first copy is now in ${check.folder}.` };
}

export async function backUpNowAction(): Promise<void> {
  backUpNow();
  revalidatePath("/backup");
}

/** Stops automatic copies. Copies already in the folder stay where they are. */
export async function stopBackupsAction(): Promise<void> {
  clearBackupFolder();
  revalidatePath("/backup");
}
