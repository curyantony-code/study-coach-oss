import fs from "fs";
import path from "path";
import { buildIndex } from "@/lib/vault/build";
import { listMarkdownFiles, readManifestText } from "@/lib/vault/files";
import type { VaultIndex } from "@/lib/vault/types";

export function fixturePath(name: string): string {
  return path.join(__dirname, "fixtures", name);
}

/** Indexes a fixture vault. `manifestText` overrides whatever study.yml is on disk. */
export function indexFixture(name: string, manifestText?: string | null): VaultIndex {
  const vaultPath = fixturePath(name);
  return buildIndex({
    vaultName: name,
    paths: listMarkdownFiles(vaultPath).map((f) => f.path),
    read: (p) => fs.readFileSync(path.join(vaultPath, p), "utf-8"),
    manifestText: manifestText === undefined ? readManifestText(vaultPath) : manifestText,
  });
}
