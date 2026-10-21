"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { renameStudent, saveProfileAnswers } from "@/lib/db/progress";
import { profileSchema } from "@/lib/learner/profile";
import { getStudyContext } from "@/lib/learner/service";

const MAX_NAME_LENGTH = 60;

export interface IntakeState {
  error?: string;
  saved?: boolean;
}

export async function saveIntakeAction(_prev: IntakeState, formData: FormData): Promise<IntakeState> {
  const ctx = await getStudyContext();
  if (!ctx) return { error: "Add a vault first." };

  const single = (name: string) => formData.get(name) ?? undefined;
  const parsed = profileSchema.safeParse({
    prior: single("prior"),
    methods: formData.getAll("methods"),
    timing: single("timing"),
    length: single("length"),
    stuck: single("stuck"),
    enjoys: formData.getAll("enjoys"),
    phone: single("phone"),
    sleep: single("sleep"),
    bestTime: single("bestTime"),
    selfConfidence: single("selfConfidence"),
  });
  if (!parsed.success) return { error: "Please answer every question with one choice (the tick-box questions can be left empty)." };

  const db = getDb();
  const name = String(formData.get("name") ?? "").trim().slice(0, MAX_NAME_LENGTH);
  if (name) renameStudent(db, ctx.student.id, name);
  saveProfileAnswers(db, ctx.student.id, ctx.vault.id, parsed.data);
  revalidatePath("/", "layout");
  return { saved: true };
}
