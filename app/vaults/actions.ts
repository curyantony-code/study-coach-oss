"use server";

import fs from "fs";
import path from "path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { ACTIVE_VAULT_COOKIE } from "@/lib/vault/active";
import { draftFileNames } from "@/lib/ai/drafts";
import { getActiveContent } from "@/lib/vault/active";
import { DRAFTS_DIR } from "@/lib/vault/files";
import { MANIFEST_FILE, parseManifest } from "@/lib/vault/manifest";
import { addVault, checkVaultPath, getVault, removeVault, setWriteEnabled } from "@/lib/vault/registry";
import { confirmSegments } from "@/lib/vault/segments";
import { forgetVaultIndex, getVaultIndex } from "@/lib/vault/store";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export interface FormState {
  error?: string;
  saved?: boolean;
  /** What the person typed, handed back so a failed form keeps it. */
  value?: string;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** A symlinked study.yml would send the write outside the vault. */
function isSymlink(file: string): boolean {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

async function setActiveVault(id: string): Promise<void> {
  (await cookies()).set(ACTIVE_VAULT_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: ONE_YEAR_SECONDS });
}

export async function addVaultAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const typed = field(formData, "path");
  const check = checkVaultPath(typed);
  if (!check.ok) return { error: check.error, value: typed };
  // Not added yet: the student first checks how the folder is split into units.
  redirect(`/vaults/review?path=${encodeURIComponent(check.path)}`);
}

/**
 * The student has looked at how a folder is split into units and says it is right: the vault
 * is added if it is new, and the split is remembered so they are not asked again until it changes.
 */
export async function confirmSegmentsAction(formData: FormData): Promise<void> {
  const db = getDb();
  const existing = getVault(db, field(formData, "vaultId"));
  let vault = existing;
  if (!vault) {
    const check = checkVaultPath(field(formData, "path"));
    if (!check.ok) redirect("/vaults");
    vault = addVault(db, check.path);
  }
  confirmSegments(vault.id, getVaultIndex(vault));
  await setActiveVault(vault.id);
  revalidatePath("/", "layout");
  redirect(existing ? "/vaults" : `/vaults/${vault.id}`);
}

export async function switchVaultAction(formData: FormData): Promise<void> {
  // "All courses" is not a vault: it opens the overview of every course.
  if (field(formData, "vaultId") === "__all__") redirect("/master");
  const vault = getVault(getDb(), field(formData, "vaultId"));
  if (!vault) return;
  await setActiveVault(vault.id);
  revalidatePath("/", "layout");
  // Choosing one course while on the overview goes to that course.
  if (field(formData, "from") === "master") redirect("/");
}

/** Forgets the vault in the app only; the vault's files are never touched. */
export async function removeVaultAction(formData: FormData): Promise<void> {
  const id = field(formData, "vaultId");
  removeVault(getDb(), id);
  forgetVaultIndex(id);
  revalidatePath("/", "layout");
  redirect("/vaults");
}

export async function setWriteEnabledAction(formData: FormData): Promise<void> {
  const id = field(formData, "vaultId");
  setWriteEnabled(getDb(), id, field(formData, "enabled") === "1");
  revalidatePath("/", "layout");
}

/**
 * Writes study.yml into a vault. Needs all three: writing switched on for that vault,
 * the confirmation tick on this save, and a manifest that parses.
 */
export async function saveManifestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Every failure hands the text back, so an error never costs the person their edits.
  const yaml = field(formData, "yaml");
  const fail = (error: string): FormState => ({ error, value: yaml });

  const vault = getVault(getDb(), field(formData, "vaultId"));
  if (!vault) return fail("That vault is no longer in the app.");
  if (!vault.writeEnabled) return fail("Writing is switched off for this vault. Turn it on above first.");
  if (field(formData, "confirm") !== "on") return fail("Tick the box to confirm writing into your vault.");

  const parsed = parseManifest(yaml);
  if (!parsed.ok) return fail(`Not saved — please fix: ${parsed.errors.join("; ")}`);

  const target = path.join(vault.path, MANIFEST_FILE);
  if (isSymlink(target)) return fail("study.yml in this vault is a shortcut to another file, so it was left alone.");
  try {
    fs.writeFileSync(target, yaml.endsWith("\n") ? yaml : `${yaml}\n`, "utf-8");
  } catch (err) {
    console.error(`Could not write ${target}`, err);
    return fail("The file could not be written. Check that the vault folder still exists and is not read-only.");
  }
  forgetVaultIndex(vault.id);
  revalidatePath("/", "layout");
  return { saved: true };
}

const MAX_DRAFT_LENGTH = 40_000;

/**
 * Saves reviewed AI card drafts to `<vault>/_study-drafts/`. Same gates as study.yml:
 * writing switched on for the vault, and the confirmation tick on this save. Never writes
 * into a note, and never outside the drafts folder.
 */
export async function saveDraftsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const content = field(formData, "content").slice(0, MAX_DRAFT_LENGTH);
  const fail = (error: string): FormState => ({ error, value: content });

  const active = await getActiveContent();
  const node = active?.index.nodes.find((n) => n.slug === field(formData, "slug"));
  if (!active || !node) return fail("That note is not in the vault you are studying.");
  // Read the toggle fresh from the database rather than trusting the page.
  const vault = getVault(getDb(), active.vault.id);
  if (!vault?.writeEnabled) return fail("Writing is switched off for this vault. Turn it on from the vault's health page first.");
  if (field(formData, "confirm") !== "on") return fail("Tick the box to confirm writing into your vault.");
  if (content.trim() === "") return fail("There is nothing to save.");

  const folder = path.join(vault.path, DRAFTS_DIR);
  if (!fs.existsSync(vault.path)) return fail("The vault folder is missing, so nothing was written.");
  if (isSymlink(folder)) return fail("The drafts folder is a shortcut to somewhere else, so nothing was written.");
  let saved = "";
  try {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder);
    // Never replace earlier drafts (the owner may have edited them): take the next free name.
    for (const name of draftFileNames(node.title)) {
      try {
        fs.writeFileSync(path.join(folder, name), content.endsWith("\n") ? content : `${content}\n`, { encoding: "utf-8", flag: "wx" });
        saved = name;
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
    }
  } catch (err) {
    console.error(`Could not write drafts into ${folder}`, err);
    return fail("The drafts could not be written. Check that the vault folder still exists and is not read-only.");
  }
  if (!saved) return fail("There are already many draft files for this note. Clear some out of _study-drafts first.");
  return { saved: true, value: `${DRAFTS_DIR}/${saved}` };
}
