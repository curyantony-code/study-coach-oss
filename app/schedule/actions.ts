"use server";

import path from "path";
import { revalidatePath } from "next/cache";
import { getStudyContext } from "@/lib/learner/service";
import { extractPdfText, listVaultPdfs, PdfToolMissingError } from "@/lib/problems/import";
import { entriesFromText, unconfirmedSchedule } from "@/lib/schedule/auto";
import { fromLines, isRealDate } from "@/lib/schedule/outline";
import { finalExam } from "@/lib/schedule/plan";
import { clearSchedule, DEFAULT_MINUTES, getSchedule, MAX_DONE, saveSchedule, type StoredSchedule } from "@/lib/schedule/store";

const MAX_TEXT = 200_000;
const COULD_NOT_SAVE = "That schedule could not be saved. Check that every line is a real date, then \"|\", then a short topic.";

/** Saves, or says why not: a schedule that breaks the store's limits must not crash the page. */
function trySave(vaultId: string, schedule: StoredSchedule): string | null {
  try {
    saveSchedule(vaultId, schedule);
    return null;
  } catch (error) {
    console.error("Saving the schedule failed", error);
    return COULD_NOT_SAVE;
  }
}

export interface ScheduleState {
  error?: string;
}

/** Step 1: read the outline (a PDF in the vault, or pasted text) and keep what was found for checking. */
export async function readOutlineAction(_prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const ctx = await getStudyContext();
  if (!ctx) return { error: "Add a vault first." };
  const pasted = String(formData.get("pasted") ?? "").slice(0, MAX_TEXT).trim();
  const file = String(formData.get("file") ?? "");
  const year = Number.parseInt(String(formData.get("year") ?? ""), 10) || ctx.now.getFullYear();
  if (year < 2000 || year > 2100) return { error: "That year does not look right." };

  let text = pasted;
  let source = "Pasted text";
  if (!text) {
    // Only a PDF that is actually in this vault can be chosen, whatever the form sends.
    if (!listVaultPdfs(ctx.vault.path).includes(file)) return { error: "Choose your course outline from the list, or paste its schedule below." };
    try {
      text = await extractPdfText(path.join(ctx.vault.path, file));
      source = path.basename(file);
    } catch (error) {
      if (error instanceof PdfToolMissingError) return { error: error.message };
      console.error("Reading the course outline failed", error);
      return { error: "That PDF could not be read. It may be a scan without text. Paste the schedule instead." };
    }
  }

  const entries = entriesFromText(text, year);
  if (entries.length === 0) {
    return { error: "No week-by-week schedule was found in that. Paste the part of the outline that lists the classes with their dates." };
  }
  const failed = trySave(ctx.vault.id, unconfirmedSchedule(entries, source));
  if (failed) return { error: failed };
  revalidatePath("/", "layout");
  return {};
}

/** Step 2: the student's corrected list and answers. */
export async function confirmScheduleAction(_prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const ctx = await getStudyContext();
  if (!ctx) return { error: "Add a vault first." };
  const current = getSchedule(ctx.vault.id);
  if (!current) return { error: "Read your course outline first." };

  const entries = fromLines(String(formData.get("lines") ?? "").slice(0, MAX_TEXT));
  if (!entries.some((e) => e.kind === "class")) return { error: 'Keep at least one class in the list. Each line is a date, then "|", then the topic.' };

  const guess = finalExam(entries.filter((e) => e.kind !== "final"));
  const typed = String(formData.get("finalDate") ?? "");
  const finalDate = isRealDate(typed) ? typed : guess?.date ?? null;
  if (!finalDate) return { error: "Enter the date of the final exam." };
  const lastClass = entries.filter((e) => e.kind === "class").pop()!.date;
  if (finalDate <= lastClass) return { error: `The final exam (${finalDate}) should come after the last class (${lastClass}). Check the date.` };

  const studyDays = formData.getAll("studyDays").map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (studyDays.length === 0) return { error: "Choose at least one day you can study." };
  const minutes = Number.parseInt(String(formData.get("minutesPerDay") ?? ""), 10);

  const failed = trySave(ctx.vault.id, {
    ...current,
    // The final is kept as its own answer, not as a line in the list.
    entries: entries.filter((e) => e.kind !== "final"),
    confirmed: true,
    finalDate,
    // Still a guess only if the student left our guess untouched and did not say they know it.
    finalAssumed: formData.get("finalKnown") !== "yes" && finalDate === guess?.date && current.finalAssumed,
    studyDays: [...new Set(studyDays)].sort(),
    minutesPerDay: Number.isFinite(minutes) ? Math.min(Math.max(minutes, 15), 480) : DEFAULT_MINUTES,
  });
  if (failed) return { error: failed };
  revalidatePath("/", "layout");
  return {};
}

/** Ticks a task off, or un-ticks it. */
export async function toggleTaskAction(formData: FormData): Promise<void> {
  const ctx = await getStudyContext();
  const current = ctx ? getSchedule(ctx.vault.id) : null;
  const id = String(formData.get("id") ?? "").slice(0, 80);
  if (!ctx || !current || !id) return;
  const done = current.done.includes(id) ? current.done.filter((d) => d !== id) : [...current.done, id];
  trySave(ctx.vault.id, { ...current, done: done.slice(-MAX_DONE) });
  revalidatePath("/schedule");
}

/** Ticks off everything dated before today: for a schedule started part-way through the term. */
export async function markEarlierDoneAction(formData: FormData): Promise<void> {
  const ctx = await getStudyContext();
  const current = ctx ? getSchedule(ctx.vault.id) : null;
  if (!ctx || !current) return;
  const ids = formData.getAll("id").map((id) => String(id).slice(0, 80)).filter(Boolean).slice(0, 500);
  trySave(ctx.vault.id, { ...current, done: [...new Set([...current.done, ...ids])].slice(-MAX_DONE) });
  revalidatePath("/schedule");
}

/** Goes back to the questions, keeping everything already entered. */
export async function editScheduleAction(): Promise<void> {
  const ctx = await getStudyContext();
  const current = ctx ? getSchedule(ctx.vault.id) : null;
  if (!ctx || !current) return;
  saveSchedule(ctx.vault.id, { ...current, confirmed: false });
  revalidatePath("/schedule");
}

/** Forgets the schedule so a different outline can be read. Nothing in the vault changes. */
export async function resetScheduleAction(): Promise<void> {
  const ctx = await getStudyContext();
  if (!ctx) return;
  clearSchedule(ctx.vault.id);
  revalidatePath("/", "layout");
}
