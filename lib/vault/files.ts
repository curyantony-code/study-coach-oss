import fs from "fs";
import path from "path";
import picomatch from "picomatch";
import { MANIFEST_FILE } from "./manifest";

/** Folders the app writes drafts into; never read back as study content. */
export const DRAFTS_DIR = "_study-drafts";

const SKIPPED_DIRS = new Set(["node_modules", DRAFTS_DIR]);

export interface FileEntry {
  /** Vault-relative path with forward slashes. */
  path: string;
  mtimeMs: number;
  size: number;
}

function isSkippedDir(parent: string, name: string): boolean {
  if (name.startsWith(".") || SKIPPED_DIRS.has(name)) return true;
  // A folder with a package.json is app code living inside the vault, not notes.
  return fs.existsSync(path.join(parent, name, "package.json"));
}

/**
 * Lists every markdown file in the vault, skipping hidden folders and app code.
 * A folder or file that cannot be read (no permission, removed mid-scan) is passed to
 * `onUnreadable` and left out, so one bad entry never hides the rest of the vault.
 */
export function listMarkdownFiles(vaultPath: string, onUnreadable: (relPath: string) => void = () => {}): FileEntry[] {
  const results: FileEntry[] = [];
  const walk = (dir: string, rel: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      onUnreadable(rel || ".");
      return;
    }
    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!isSkippedDir(dir, entry.name)) walk(path.join(dir, entry.name), relPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        try {
          const stat = fs.statSync(path.join(dir, entry.name));
          results.push({ path: relPath, mtimeMs: stat.mtimeMs, size: stat.size });
        } catch {
          onUnreadable(relPath);
        }
      }
    }
  };
  walk(vaultPath, "");
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

export function filterByGlobs(paths: string[], include: string[] | undefined, exclude: string[]): string[] {
  const isIncluded = include && include.length > 0 ? picomatch(include) : () => true;
  const isExcluded = exclude.length > 0 ? picomatch(exclude) : () => false;
  return paths.filter((p) => isIncluded(p) && !isExcluded(p));
}

export function readManifestText(vaultPath: string): string | null {
  const file = path.join(vaultPath, MANIFEST_FILE);
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    // Missing or unreadable: either way the vault is indexed without a manifest.
    return null;
  }
}

/** Changes whenever any note or the manifest is added, removed or edited. */
export function vaultSignature(vaultPath: string, files: FileEntry[]): string {
  const manifestFile = path.join(vaultPath, MANIFEST_FILE);
  const manifestStamp = fs.existsSync(manifestFile) ? fs.statSync(manifestFile).mtimeMs : 0;
  return [manifestStamp, ...files.map((f) => `${f.path}:${f.mtimeMs}:${f.size}`)].join("|");
}
