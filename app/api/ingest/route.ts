import { z } from "zod";
import { fail, guarded, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { ingestNext, removeFigures } from "@/lib/ingest/service";
import { forgetDoc } from "@/lib/ingest/store";
import { listVaultPdfs } from "@/lib/problems/import";
import { getActiveVault } from "@/lib/vault/active";

const bodySchema = z.object({
  file: z.string().min(1).max(1000),
  action: z.enum(["next", "forget"]).default("next"),
});

/**
 * action=next   reads the next few pages of a PDF in the active vault and reports progress.
 * action=forget drops what was read from that PDF (the PDF itself is never touched).
 */
export function POST(request: Request) {
  return guarded("Reading a PDF", async () => {
    // Reading a PDF costs time and disk: only this app's own pages may ask for it.
    if (request.headers.get("sec-fetch-site") === "cross-site") return fail("That request did not come from Study Coach.", 403);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Choose a PDF first.");
    const vault = await getActiveVault();
    if (!vault) return fail("Add a vault first.", 404);
    // Only a PDF that is actually in this vault can be read, whatever the request names.
    if (!listVaultPdfs(vault.path).includes(parsed.data.file)) return fail("That PDF is not in this vault.", 404);
    if (parsed.data.action === "forget") {
      forgetDoc(getDb(), vault.id, parsed.data.file);
      removeFigures(vault.id, parsed.data.file);
      return ok({ total: 0, done: 0, reader: null });
    }
    return ok(await ingestNext(vault, parsed.data.file));
  });
}
