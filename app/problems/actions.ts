"use server";

import { revalidatePath } from "next/cache";
import { getStudyContext } from "@/lib/learner/service";
import { parseOutline } from "@/lib/problems/outline";
import { getDb } from "@/lib/db/client";
import { clearTextbook, importTextbook, listVaultPdfs, PdfToolMissingError } from "@/lib/problems/import";
import { saveOutlineText } from "@/lib/problems/service";
import { forgetVaultIndex } from "@/lib/vault/store";

const MAX_OUTLINE_LENGTH = 20_000;

export interface OutlineState {
  error?: string;
  saved?: string;
  value?: string;
}

/** Saves the pasted "assigned problems" list for the active vault. Stored in the app, not in the vault. */
export async function saveOutlineAction(_prev: OutlineState, formData: FormData): Promise<OutlineState> {
  const ctx = await getStudyContext();
  if (!ctx) return { error: "Add a vault first." };
  const text = String(formData.get("outline") ?? "").slice(0, MAX_OUTLINE_LENGTH).trim();

  if (text === "") {
    saveOutlineText(ctx.vault.id, "");
    revalidatePath("/problems");
    return { saved: "Outline cleared. Problems are grouped by the chapters in your notes.", value: "" };
  }
  const chapters = parseOutline(text);
  if (chapters.length === 0) {
    return { error: 'No chapters were found. Each line should look like "Chapter 7: 4 to 12, 16; CFA problems 5, 9, 10".', value: text };
  }
  saveOutlineText(ctx.vault.id, text);
  revalidatePath("/problems");
  const count = chapters.reduce((sum, c) => sum + c.items.length, 0);
  return { saved: `Saved: ${count} assigned problems across ${chapters.length} chapters.`, value: text };
}

export interface TextbookState {
  error?: string;
  saved?: string;
}

/**
 * Imports the full wording of the textbook's problems from a PDF in the active vault.
 * The PDF is only read; the text is kept in Study Coach's own database.
 */
export async function importTextbookAction(_prev: TextbookState, formData: FormData): Promise<TextbookState> {
  const ctx = await getStudyContext();
  if (!ctx) return { error: "Add a vault first." };

  if (formData.get("intent") === "remove") {
    clearTextbook(getDb(), ctx.vault.id);
    forgetVaultIndex(ctx.vault.id);
    revalidatePath("/", "layout");
    return { saved: "Removed. Problems show the wording from your notes again." };
  }

  // Only a PDF that is actually in this vault can be chosen, whatever the form sends.
  const file = String(formData.get("file") ?? "");
  if (!listVaultPdfs(ctx.vault.path).includes(file)) return { error: "Choose one of the PDFs in this vault." };

  try {
    const summary = await importTextbook(ctx.vault.id, ctx.vault.path, file);
    forgetVaultIndex(ctx.vault.id);
    revalidatePath("/", "layout");
    if (summary.count === 0) return { error: "No numbered problem sets were found in that PDF. Is it the right file?" };
    return { saved: `Read ${summary.count} problems from that PDF.` };
  } catch (error) {
    if (error instanceof PdfToolMissingError) return { error: error.message };
    console.error("Importing the textbook PDF failed", error);
    return { error: "That PDF could not be read. It may be a scan without text, or damaged." };
  }
}
