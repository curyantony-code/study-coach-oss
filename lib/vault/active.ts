import path from "path";
import { cookies } from "next/headers";
import { getDb } from "../db/client";
import { addVault, checkVaultPath, getSetting, getVault, listVaults, setSetting, type Vault } from "./registry";
import { withScheduleDates } from "../schedule/assessments";
import { ensureSchedule } from "../schedule/auto";
import { getSchedule } from "../schedule/store";
import { getVaultIndex } from "./store";
import type { VaultIndex } from "./types";

export const ACTIVE_VAULT_COOKIE = "sc_vault";
const SEEDED_SETTING = "legacy_vault_seeded";

/**
 * First run after upgrading from the single-vault version: the old WIKI_ROOT setting points at
 * `<vault>/wiki`, so register that vault once instead of starting with an empty app.
 */
function seedFromLegacyEnv(): void {
  const db = getDb();
  const wikiRoot = process.env.WIKI_ROOT;
  // Only ever once, so removing every vault later does not bring this one back.
  if (!wikiRoot || getSetting(db, SEEDED_SETTING)) return;
  setSetting(db, SEEDED_SETTING, "1");
  const check = checkVaultPath(path.dirname(wikiRoot));
  if (check.ok) addVault(db, check.path);
}

export function getVaults(): Vault[] {
  const db = getDb();
  const vaults = listVaults(db);
  if (vaults.length > 0) return vaults;
  seedFromLegacyEnv();
  return listVaults(db);
}

/** The vault being studied: the one picked in the switcher, else the first one added. */
export async function getActiveVault(): Promise<Vault | null> {
  const vaults = getVaults();
  const picked = (await cookies()).get(ACTIVE_VAULT_COOKIE)?.value;
  return (picked && getVault(getDb(), picked)) || vaults[0] || null;
}

export interface ActiveContent {
  vault: Vault;
  index: VaultIndex;
}

export async function getActiveContent(): Promise<ActiveContent | null> {
  const vault = await getActiveVault();
  if (!vault) return null;
  const index = getVaultIndex(vault);
  // Test dates come from the course outline: read it the first time, then date the assessments from it.
  await ensureSchedule(vault);
  return { vault, index: { ...index, assessments: withScheduleDates(index.assessments, getSchedule(vault.id), index.units) } };
}
