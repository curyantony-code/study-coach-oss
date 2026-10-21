import { getFixes, getQuestionStyle, withCompletedQuestions } from "../problems/fixes";
import fs from "fs";
import path from "path";
import { getDb } from "../db/client";
import { loadOriginals } from "../problems/import";
import { withOriginalQuestions } from "../problems/originals";
import { buildIndex } from "./build";
import { listMarkdownFiles, readManifestText, vaultSignature } from "./files";
import { markIndexed, type Vault } from "./registry";
import type { VaultIndex } from "./types";

/** How long an index is reused before the vault's files are checked for changes again. */
const RECHECK_AFTER_MS = 2000;

interface CacheEntry {
  signature: string;
  checkedAt: number;
  index: VaultIndex;
}

// Module-level on purpose: when the reading rules change during development the module is
// reloaded and the cache starts empty, so an index built by older rules is never served.
const cache = new Map<string, CacheEntry>();

const EMPTY_INDEX: Omit<VaultIndex, "course" | "warnings"> = {
  style: "generic",
  hasManifest: false,
  units: [],
  assessments: [],
  nodes: [],
  edges: [],
  cards: [],
  brokenLinks: [],
};

/**
 * Reads a vault into a VaultIndex. Re-indexes automatically when any note or study.yml
 * changes (detected by file modification times), otherwise serves the cached index.
 */
export function getVaultIndex(vault: Vault): VaultIndex {
  const cached = cache.get(vault.id);
  if (cached && Date.now() - cached.checkedAt < RECHECK_AFTER_MS) return cached.index;

  if (!fs.existsSync(vault.path)) {
    return { ...EMPTY_INDEX, course: { name: vault.name }, warnings: [`The vault folder is missing: ${vault.path}`] };
  }

  const skipped: string[] = [];
  const files = listMarkdownFiles(vault.path, (p) => skipped.push(p));
  const signature = [vaultSignature(vault.path, files), ...skipped].join("|");
  if (cached && cached.signature === signature) {
    cache.set(vault.id, { ...cached, checkedAt: Date.now() });
    return cached.index;
  }

  const built = buildIndex({
    vaultName: vault.name,
    paths: files.map((f) => f.path),
    read: (p) => fs.readFileSync(path.join(vault.path, p), "utf-8"),
    manifestText: readManifestText(vault.path),
  });
  // Problem cards show the textbook's full wording when the vault's problem-set PDF has been imported.
  // Failing that, a question the student had the AI write out in full is shown in that form.
  const cards = withCompletedQuestions(withOriginalQuestions(built.cards, loadOriginals(getDb(), vault.id)), getFixes(getDb(), vault.id), getQuestionStyle(getDb()));
  const index = { ...built, cards, warnings: [...skipped.map((p) => `Could not open ${p} (no permission?). It was skipped.`), ...built.warnings] };
  cache.set(vault.id, { signature, checkedAt: Date.now(), index });
  markIndexed(getDb(), vault.id, index.style);
  return index;
}

/**
 * Reads a folder that is not (yet) one of the app's vaults, to show what adding it would
 * give. Nothing is saved: no cache, no database row.
 */
export function previewVaultIndex(vaultPath: string): VaultIndex {
  const files = listMarkdownFiles(vaultPath, () => undefined);
  return buildIndex({
    vaultName: path.basename(vaultPath),
    paths: files.map((f) => f.path),
    read: (p) => fs.readFileSync(path.join(vaultPath, p), "utf-8"),
    manifestText: readManifestText(vaultPath),
  });
}

export function forgetVaultIndex(vaultId: string): void {
  cache.delete(vaultId);
}

/** For a change that affects every vault, such as which wording of questions is shown. */
export function forgetAllVaultIndexes(): void {
  cache.clear();
}
