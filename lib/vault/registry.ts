import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import type { Db } from "../db/client";
import type { VaultStyle } from "./types";

export interface Vault {
  id: string;
  name: string;
  path: string;
  style: VaultStyle;
  writeEnabled: boolean;
  lastIndexedAt: string | null;
}

interface VaultRow {
  id: string;
  name: string;
  path: string;
  adapter: string;
  write_enabled: number;
  last_indexed_at: string | null;
}

function toVault(row: VaultRow): Vault {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    style: row.adapter === "wiki-schema" ? "wiki-schema" : "generic",
    writeEnabled: row.write_enabled === 1,
    lastIndexedAt: row.last_indexed_at,
  };
}

export type PathCheck = { ok: true; path: string } | { ok: false; error: string };

/** Accepts a pasted folder path ("~/Notes", quoted, trailing slash) and checks it is a real folder. */
export function checkVaultPath(input: string): PathCheck {
  const cleaned = input.trim().replace(/^["']|["']$/g, "");
  if (!cleaned) return { ok: false, error: "Paste the folder path of the vault." };
  const expanded = cleaned === "~" || cleaned.startsWith("~/") ? path.join(os.homedir(), cleaned.slice(1)) : cleaned;
  if (!path.isAbsolute(expanded)) {
    return { ok: false, error: "Use the full path, starting with / or ~ (for example ~/Documents/My Vault)." };
  }
  let resolved: string;
  try {
    resolved = fs.realpathSync(expanded);
  } catch {
    return { ok: false, error: `That folder does not exist: ${expanded}` };
  }
  if (!fs.statSync(resolved).isDirectory()) return { ok: false, error: "That path is a file, not a folder." };
  if (resolved === path.parse(resolved).root || resolved === fs.realpathSync(os.homedir())) {
    return { ok: false, error: "That is your whole computer or home folder. Pick the vault folder itself." };
  }
  return { ok: true, path: resolved };
}

export function listVaults(db: Db): Vault[] {
  const rows = db.prepare("SELECT * FROM vaults WHERE removed_at IS NULL ORDER BY created_at, name").all() as unknown as VaultRow[];
  return rows.map(toVault);
}

export function getVault(db: Db, id: string): Vault | null {
  const row = db.prepare("SELECT * FROM vaults WHERE id = ? AND removed_at IS NULL").get(id) as unknown as VaultRow | undefined;
  return row ? toVault(row) : null;
}

export function findVaultByPath(db: Db, vaultPath: string): Vault | null {
  const row = db.prepare("SELECT * FROM vaults WHERE path = ? AND removed_at IS NULL").get(vaultPath) as unknown as VaultRow | undefined;
  return row ? toVault(row) : null;
}

/**
 * Registers a vault. Adding the same folder twice returns the existing entry, and adding
 * back a folder that was removed restores it under its old id, so its progress returns too.
 */
export function addVault(db: Db, vaultPath: string, name?: string): Vault {
  db.prepare("UPDATE vaults SET removed_at = NULL WHERE path = ?").run(vaultPath);
  const existing = findVaultByPath(db, vaultPath);
  if (existing) return existing;
  const id = randomUUID();
  db.prepare("INSERT INTO vaults (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    name?.trim() || path.basename(vaultPath),
    vaultPath,
    new Date().toISOString()
  );
  return getVault(db, id)!;
}

/** Takes a vault off the list. Never touches the vault's files, and keeps its study progress. */
export function removeVault(db: Db, id: string): void {
  db.prepare("UPDATE vaults SET removed_at = ?, write_enabled = 0 WHERE id = ?").run(new Date().toISOString(), id);
}

export function setWriteEnabled(db: Db, id: string, enabled: boolean): void {
  db.prepare("UPDATE vaults SET write_enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}

export function markIndexed(db: Db, id: string, style: VaultStyle): void {
  db.prepare("UPDATE vaults SET adapter = ?, last_indexed_at = ? WHERE id = ?").run(style, new Date().toISOString(), id);
}

export function getSetting(db: Db, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
