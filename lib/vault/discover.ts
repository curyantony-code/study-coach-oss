// Looks through the folders around the vaults the student already uses for other folders
// that are vaults, so a new course can be added without typing its path. Only folder names
// are read here; nothing is opened until the student asks to review one.
import fs from "fs";
import os from "os";
import path from "path";

const MAX_DEPTH = 5;
const MAX_FOLDERS = 3000;
/** Folders inside a vault (or beside one) that never hold another vault. */
const NOT_SEARCHED = new Set(["wiki", "raw", "node_modules", "mcp-server", "memory", "handover", "_study-drafts", "attachments", "assets", "templates"]);

export interface FoundVault {
  name: string;
  path: string;
  /** Why it looks like a vault, in the student's words. */
  because: string;
  /** The folder it sits in, to tell two vaults with the same name apart. */
  inside: string;
}

function childNames(folder: string): { folders: string[]; files: string[] } {
  try {
    const entries = fs.readdirSync(folder, { withFileTypes: true });
    return {
      folders: entries.filter((e) => e.isDirectory()).map((e) => e.name),
      files: entries.filter((e) => e.isFile()).map((e) => e.name),
    };
  } catch {
    return { folders: [], files: [] };
  }
}

/** Says why a folder looks like a vault, or null when it does not. Decided from names alone. */
export function vaultSigns(folders: string[], files: string[]): string | null {
  if (files.includes("study.yml")) return "has a study.yml";
  if (folders.includes(".obsidian")) return "an Obsidian vault";
  if (folders.includes("wiki") && folders.includes("raw")) return "has wiki and raw folders";
  return null;
}

/**
 * Where to look: the top folder (under the home folder) that each known vault lives in. A
 * vault kept directly in the home folder, or outside it, contributes its parent folder,
 * and the home folder itself is never searched.
 */
export function searchRoots(knownPaths: string[], home: string = os.homedir()): string[] {
  const roots = new Set<string>();
  for (const known of knownPaths) {
    const relative = path.relative(home, known);
    const underHome = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
    const parts = relative.split(path.sep);
    const root = underHome && parts.length > 1 ? path.join(home, parts[0]) : path.dirname(known);
    if (root !== home && root !== path.parse(root).root) roots.add(root);
  }
  return [...roots].sort();
}

/** A folder's path as the disk spells it, so "op_mktg401" and "op_MKTG401" are seen as the same folder on a Mac. */
function onDisk(folder: string): string {
  try {
    return fs.realpathSync.native(folder);
  } catch {
    return path.resolve(folder);
  }
}

/** Vault-looking folders under `roots` that are not in `already`. */
export function findVaults(roots: string[], already: string[]): FoundVault[] {
  const known = new Set(already.map(onDisk));
  const found = new Map<string, FoundVault>();
  let visited = 0;
  const walk = (folder: string, depth: number) => {
    if (depth > MAX_DEPTH || ++visited > MAX_FOLDERS) return;
    const { folders, files } = childNames(folder);
    const because = depth > 0 ? vaultSigns(folders, files) : null;
    if (because && !known.has(folder)) {
      found.set(folder, { name: path.basename(folder), path: folder, because, inside: path.basename(path.dirname(folder)) });
    }
    for (const name of folders) {
      if (name.startsWith(".") || NOT_SEARCHED.has(name.toLowerCase())) continue;
      walk(path.join(folder, name), depth + 1);
    }
  };
  for (const root of roots) walk(onDisk(root), 0);
  return [...found.values()].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}
