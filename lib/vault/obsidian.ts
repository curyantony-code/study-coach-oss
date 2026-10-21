import fs from "fs";
import os from "os";
import path from "path";
import { z } from "zod";

/** Where Obsidian keeps its list of known vaults on macOS. */
const OBSIDIAN_CONFIG = path.join(os.homedir(), "Library", "Application Support", "obsidian", "obsidian.json");

const configSchema = z.object({
  vaults: z.record(z.string(), z.object({ path: z.string() })).default({}),
});

export interface KnownVault {
  name: string;
  path: string;
}

/** Vaults Obsidian already knows about. Empty when Obsidian is not installed or its file is unreadable. */
export function listObsidianVaults(configFile: string = OBSIDIAN_CONFIG): KnownVault[] {
  let parsed: z.infer<typeof configSchema>;
  try {
    parsed = configSchema.parse(JSON.parse(fs.readFileSync(configFile, "utf-8")));
  } catch {
    // No Obsidian config is a normal situation: the owner can still paste a folder path.
    return [];
  }
  return Object.values(parsed.vaults)
    .filter((v) => fs.existsSync(v.path) && fs.statSync(v.path).isDirectory())
    .map((v) => ({ name: path.basename(v.path), path: v.path }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
