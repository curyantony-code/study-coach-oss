// Creates a new vault folder from a plan. Only ever creates: an existing folder is never
// written into, and the student's original files are copied, never moved or changed.
import fs from "fs";
import os from "os";
import path from "path";
import type { Db } from "../db/client";
import { MANIFEST_FILE } from "../vault/manifest";
import { getSetting, setSetting } from "../vault/registry";
import { safeName, type CoursePlan } from "./plan";

const ROOT_SETTING = "build:root";

export function defaultBuildRoot(): string {
  // Set in Docker, where the home folder is the container's own and only mounted folders last.
  return process.env.STUDY_COURSES_DIR || path.join(os.homedir(), "Documents", "Study Coach Vaults");
}

export function buildRoot(db: Db): string {
  return getSetting(db, ROOT_SETTING) || defaultBuildRoot();
}

function within(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * A path as the disk knows it, even when its last folders do not exist yet: links are
 * followed, and on a Mac or Windows (where "Documents" and "documents" are one folder) the
 * letters are folded, so two spellings of one place compare equal.
 */
export function onDisk(target: string, platform: NodeJS.Platform = process.platform): string {
  let existing = path.resolve(target);
  const missing: string[] = [];
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) {
    missing.unshift(path.basename(existing));
    existing = path.dirname(existing);
  }
  let real = existing;
  try {
    real = fs.realpathSync.native(existing);
  } catch {
    // Unreadable: compare it as typed.
  }
  const full = path.join(real, ...missing);
  return platform === "darwin" || platform === "win32" ? full.toLowerCase() : full;
}

/** The vault a folder is inside of, if any. */
export function vaultAround(folder: string, vaultPaths: string[]): string | null {
  const target = onDisk(folder);
  return vaultPaths.find((vault) => within(onDisk(vault), target)) ?? null;
}

export class InsideVaultError extends Error {}

export type RootCheck = { ok: true; path: string } | { ok: false; error: string };

/** A place new course folders may be created: a real location, and never inside an existing vault. */
export function checkBuildRoot(input: string, vaultPaths: string[], home: string = os.homedir()): RootCheck {
  const cleaned = input.trim().replace(/^["']|["']$/g, "");
  if (!cleaned) return { ok: false, error: "Type the folder where new courses should be created." };
  const expanded = cleaned === "~" || cleaned.startsWith("~/") ? path.join(home, cleaned.slice(1)) : cleaned;
  if (!path.isAbsolute(expanded)) return { ok: false, error: "Use the full path, starting with / or ~ (for example ~/Documents/Study Coach Vaults)." };
  const resolved = path.resolve(expanded);
  if (resolved === path.parse(resolved).root || resolved === path.resolve(home)) return { ok: false, error: "Pick a folder inside your home folder, not the whole of it." };
  const inside = vaultAround(resolved, vaultPaths);
  if (inside) return { ok: false, error: `That is inside one of your vaults (${path.basename(inside)}). New courses get folders of their own, outside existing vaults.` };
  if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) return { ok: false, error: "That path is a file, not a folder." };
  return { ok: true, path: resolved };
}

export function saveBuildRoot(db: Db, root: string): void {
  setSetting(db, ROOT_SETTING, root);
}

/** A folder name for the course that does not exist yet: "FIN 101", else "FIN 101 (2)". */
export function freeFolder(root: string, course: string, exists: (folder: string) => boolean = fs.existsSync): string {
  const base = safeName(course);
  let candidate = path.join(root, base);
  for (let n = 2; exists(candidate); n++) candidate = path.join(root, `${base} (${n})`);
  return candidate;
}

/**
 * Writes the vault. `sources` maps each planned copy to the original file on this computer.
 * `vaultPaths` are the existing vaults: the place is checked again here, because a vault may
 * have been added inside it since the place was chosen.
 */
export function writeVault(root: string, plan: CoursePlan, sources: Map<string, string>, vaultPaths: string[] = []): string {
  const inside = vaultAround(root, vaultPaths);
  if (inside) throw new InsideVaultError(`New courses cannot be created inside an existing vault (${path.basename(inside)}). Choose another folder for new courses.`);
  fs.mkdirSync(root, { recursive: true });
  const vaultPath = freeFolder(root, plan.course);
  // Fails if the folder appeared in the meantime, so nothing existing is ever written into.
  fs.mkdirSync(vaultPath);
  try {
    const place = (relative: string) => {
      const target = path.join(vaultPath, ...relative.split("/"));
      if (!within(vaultPath, target)) throw new Error(`Refusing to write outside the new vault: ${relative}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      return target;
    };
    fs.writeFileSync(place(MANIFEST_FILE), plan.manifest, { flag: "wx" });
    for (const note of plan.notes) fs.writeFileSync(place(note.path), note.content, { flag: "wx" });
    for (const copy of plan.copies) {
      const from = sources.get(copy.id);
      if (from) fs.copyFileSync(from, place(copy.to), fs.constants.COPYFILE_EXCL);
    }
    return vaultPath;
  } catch (error) {
    // Half a course is worse than none. This folder was created a moment ago by this call.
    fs.rmSync(vaultPath, { recursive: true, force: true });
    throw error;
  }
}
