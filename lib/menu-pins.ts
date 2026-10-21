// Which menu items the student pinned for each course. A finance course and a marketing
// course are studied differently, so each vault keeps its own shortcuts.
import { getDb } from "./db/client";
import { cleanPins, togglePin } from "./menu";
import { getSetting, setSetting } from "./vault/registry";

const key = (vaultId: string) => `menu-pins:${vaultId}`;

export function getPins(vaultId: string): string[] {
  try {
    return cleanPins(JSON.parse(getSetting(getDb(), key(vaultId)) || "[]"));
  } catch {
    return [];
  }
}

export function togglePinFor(vaultId: string, href: string): string[] {
  const next = togglePin(getPins(vaultId), href);
  setSetting(getDb(), key(vaultId), JSON.stringify(next));
  return next;
}
