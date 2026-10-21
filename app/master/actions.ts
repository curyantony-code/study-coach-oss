"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { MAX_DAILY_MINUTES, MIN_DAILY_MINUTES, saveBudget, toggleHidden } from "@/lib/schedule/shared-settings";
import { getVault } from "@/lib/vault/registry";

/** Takes a course out of the all-courses overview, or puts it back. The vault itself is untouched. */
export async function toggleCourseAction(formData: FormData): Promise<void> {
  const id = String(formData.get("vaultId") ?? "").slice(0, 80);
  if (!getVault(getDb(), id)) return;
  toggleHidden(id);
  revalidatePath("/master");
}

export interface BudgetState {
  error?: string;
  saved?: boolean;
}

/** Sets how much the student can study in a day across all courses, and on which days. Every course's plan follows. */
export async function saveBudgetAction(_previous: BudgetState, formData: FormData): Promise<BudgetState> {
  const minutes = Number.parseInt(String(formData.get("minutesPerDay") ?? ""), 10);
  const days = formData.getAll("studyDays").map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  if (!Number.isFinite(minutes) || minutes < MIN_DAILY_MINUTES || minutes > MAX_DAILY_MINUTES) return { error: "Choose how long you can study on a study day." };
  if (days.length === 0) return { error: "Choose at least one day you can study." };
  saveBudget({ studyDays: days, minutesPerDay: minutes });
  revalidatePath("/", "layout");
  return { saved: true };
}
