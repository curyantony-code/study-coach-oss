"use server";

import { revalidatePath } from "next/cache";
import { togglePinFor } from "@/lib/menu-pins";
import { getActiveVault } from "@/lib/vault/active";

/** Pins or unpins a menu item for the course being studied. */
export async function togglePinAction(formData: FormData): Promise<void> {
  const vault = await getActiveVault();
  const href = String(formData.get("href") ?? "").slice(0, 100);
  if (!vault || !href) return;
  togglePinFor(vault.id, href);
  revalidatePath("/", "layout");
}
