// A vault's study schedule: the classes and tests read from its outline, and the student's
// answers. Kept in the app's own database, never in the vault.
import { z } from "zod";
import { getDb } from "../db/client";
import { getSetting, setSetting } from "../vault/registry";
import { isRealDate } from "./outline";

const realDate = z.string().refine(isRealDate, "not a real date");
export const MAX_DONE = 5000;

const entrySchema = z.object({
  date: realDate,
  kind: z.enum(["class", "test", "final", "break", "deadline"]),
  title: z.string().min(1).max(600),
  chapters: z.array(z.number().int()).max(40),
});

const scheduleSchema = z.object({
  entries: z.array(entrySchema).max(300),
  /** Where the entries were read from, e.g. the outline's file name. */
  source: z.string().max(400),
  /** False until the student has checked the entries and answered the questions. */
  confirmed: z.boolean(),
  finalDate: realDate.nullable(),
  /** True while the final's date is our guess (a week after the last class). */
  finalAssumed: z.boolean(),
  studyDays: z.array(z.number().int().min(0).max(6)).max(7),
  minutesPerDay: z.number().int().min(15).max(480),
  /** Ids of plan tasks the student has ticked off. */
  done: z.array(z.string().max(80)).max(MAX_DONE),
});

export type StoredSchedule = z.infer<typeof scheduleSchema>;

export const DEFAULT_STUDY_DAYS = [1, 2, 3, 4, 5, 6];
export const DEFAULT_MINUTES = 60;

const key = (vaultId: string) => `schedule:${vaultId}`;

export function getSchedule(vaultId: string): StoredSchedule | null {
  const raw = getSetting(getDb(), key(vaultId));
  if (!raw) return null;
  try {
    const parsed = scheduleSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveSchedule(vaultId: string, schedule: StoredSchedule): void {
  setSetting(getDb(), key(vaultId), JSON.stringify(scheduleSchema.parse(schedule)));
}

export function clearSchedule(vaultId: string): void {
  setSetting(getDb(), key(vaultId), "");
}
