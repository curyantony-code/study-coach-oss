"use server";

import { revalidatePath } from "next/cache";
import { checkKey } from "@/lib/ai/key-check";
import { cleanPasted, saveSetting, settingsFilePath, shapeProblem, specFor } from "@/lib/ai/settings-file";

export interface KeyFormState {
  error?: string;
  saved?: string;
  /** A note to read even though the key was saved (no internet, API not switched on yet). */
  note?: string;
}

const NO_FILE = "Keys can't be saved from this page here. In Docker, put them in .env.local next to docker-compose.yml and restart.";
const RESTART_NOTE = "Study Coach is restarting to use it; the page reloads by itself in a few seconds.";

function afterSave(): string {
  // The desktop app restarts its engine when its settings file changes; from source, restart by hand.
  return process.env.STUDY_SETTINGS_FILE ? RESTART_NOTE : "Restart Study Coach (stop npm run dev and start it again) to use it everywhere.";
}

/** Checks, tries and saves one pasted key. A key the provider rejects is not saved. */
export async function saveKeyAction(_prev: KeyFormState, formData: FormData): Promise<KeyFormState> {
  const spec = specFor(String(formData.get("name") ?? ""));
  if (!spec) return { error: "Unknown key." };
  const file = settingsFilePath();
  if (!file) return { error: NO_FILE };
  const key = cleanPasted(spec.name, String(formData.get("key") ?? "").slice(0, 400));
  const problem = shapeProblem(spec, key);
  if (problem) return { error: problem };

  const check = await checkKey(spec.name, key);
  if (check.status === "rejected") return { error: check.message };
  try {
    saveSetting(file, spec.name, key);
  } catch (error) {
    console.error("Could not save the key", error);
    return { error: `The key works, but it could not be saved to ${file}. Check that this folder is not read-only.` };
  }
  revalidatePath("/setup-ai");
  return check.status === "works"
    ? { saved: `It works! Your ${spec.label} key is saved. ${afterSave()}` }
    : { saved: `Your ${spec.label} key is saved. ${afterSave()}`, note: check.message };
}

/** Forgets one key. The provider's own website is where a key is deleted for good. */
export async function removeKeyAction(formData: FormData): Promise<void> {
  const spec = specFor(String(formData.get("name") ?? ""));
  const file = settingsFilePath();
  if (!spec || !file) return;
  saveSetting(file, spec.name, null);
  revalidatePath("/setup-ai");
}
