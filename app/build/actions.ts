"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { filesUnder, removeUpload } from "@/lib/build/inbox";
import { addInboxFile, getInboxFile, listInbox, removeInboxFile, resetTags, saveTags } from "@/lib/build/store";
import { cleanCourse, KINDS, unitFromInput, type Kind } from "@/lib/build/tags";
import { checkBuildRoot, saveBuildRoot } from "@/lib/build/write";
import { checkVaultPath, listVaults } from "@/lib/vault/registry";

export interface BuildFormState {
  error?: string;
  message?: string;
  value?: string;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Adds every usable file under a folder on this computer. The folder is only read. */
export async function addFolderAction(_prev: BuildFormState, formData: FormData): Promise<BuildFormState> {
  const typed = field(formData, "path");
  const check = checkVaultPath(typed);
  if (!check.ok) return { error: check.error.replace("of the vault", "of the folder").replace("Pick the vault folder itself.", "Pick the folder with your course files."), value: typed };
  const { files, more } = filesUnder(check.path);
  if (files.length === 0) return { error: "No PDFs, slides, documents or notes were found in that folder.", value: typed };
  const db = getDb();
  const now = new Date();
  const added = files.filter((file) => addInboxFile(db, { ...file, origin: "folder" }, now)).length;
  revalidatePath("/build");
  return { message: `${added} file${added === 1 ? "" : "s"} added${added < files.length ? `, ${files.length - added} already here` : ""}${more ? ". The folder has more than 600 files; the rest were left out" : ""}.` };
}

/** The student corrects a file's tags. */
export async function updateFileAction(formData: FormData): Promise<void> {
  const db = getDb();
  const file = getInboxFile(db, field(formData, "id"));
  if (!file || file.status === "built") return;
  const kind = field(formData, "kind");
  const typedCourse = field(formData, "course").trim();
  saveTags(db, file.id, {
    // An empty box means "no course"; something that is not a course code leaves it as it was.
    course: typedCourse ? cleanCourse(typedCourse) ?? file.course : null,
    kind: (KINDS as readonly string[]).includes(kind) ? (kind as Kind) : file.kind,
    unit: unitFromInput(field(formData, "unit")),
    title: field(formData, "title").replace(/\s+/g, " ").trim().slice(0, 90) || file.title,
    how: "you",
  });
  revalidatePath("/build");
}

/** Takes a file out of the inbox. An uploaded copy is removed; a file in your own folder is never touched. */
export async function removeFileAction(formData: FormData): Promise<void> {
  const db = getDb();
  const file = getInboxFile(db, field(formData, "id"));
  if (!file) return;
  if (file.origin === "upload") removeUpload(file.id);
  removeInboxFile(db, file.id);
  revalidatePath("/build");
}

/** Clears the list of files that are already in a course. */
export async function clearBuiltAction(): Promise<void> {
  const db = getDb();
  for (const file of listInbox(db)) if (file.status === "built") removeInboxFile(db, file.id);
  revalidatePath("/build");
}

export async function saveRootAction(_prev: BuildFormState, formData: FormData): Promise<BuildFormState> {
  const typed = field(formData, "root");
  const db = getDb();
  const check = checkBuildRoot(typed, listVaults(db).map((vault) => vault.path));
  if (!check.ok) return { error: check.error, value: typed };
  saveBuildRoot(db, check.path);
  revalidatePath("/build");
  return { message: "Saved.", value: check.path };
}

/** Tags every file again, keeping the ones the student corrected. */
export async function retagAction(): Promise<void> {
  resetTags(getDb());
  revalidatePath("/build");
}

/** Puts every file that has no course yet into one course, for a batch that is all one course. */
export async function assignUnsortedAction(_prev: BuildFormState, formData: FormData): Promise<BuildFormState> {
  const typed = field(formData, "course");
  const course = cleanCourse(typed);
  if (!course) return { error: "Type a course code such as FIN 101.", value: typed };
  const db = getDb();
  const unsorted = listInbox(db).filter((file) => file.status === "tagged" && !file.course);
  for (const file of unsorted) saveTags(db, file.id, { course, kind: file.kind, unit: file.unit, title: file.title, how: "you" });
  revalidatePath("/build");
  return { message: `${unsorted.length} file${unsorted.length === 1 ? "" : "s"} moved to ${course}.` };
}

/** Says which course an outline is for, when its text did not give the code. */
export async function setOutlineCourseAction(_prev: BuildFormState, formData: FormData): Promise<BuildFormState> {
  const typed = field(formData, "course");
  const course = cleanCourse(typed);
  if (!course) return { error: "Type a course code such as FIN 101.", value: typed };
  const db = getDb();
  const file = getInboxFile(db, field(formData, "id"));
  if (!file || file.status === "built") return { error: "That outline is no longer here." };
  saveTags(db, file.id, { course, kind: "outline", unit: null, title: file.title, how: "you" });
  revalidatePath("/build");
  return {};
}
