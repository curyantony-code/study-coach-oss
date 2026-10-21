import fs from "fs";
import { NextResponse } from "next/server";
import { fail, guarded } from "@/lib/api";
import { figurePath } from "@/lib/ingest/service";
import { getActiveVault } from "@/lib/vault/active";

/** A diagram saved while reading a PDF. Only names this app wrote, inside its own data folder, are served. */
export function GET(request: Request) {
  return guarded("Showing a figure", async () => {
    const params = new URL(request.url).searchParams;
    const vault = await getActiveVault();
    const file = vault ? figurePath(vault.id, params.get("doc") ?? "", params.get("name") ?? "") : null;
    if (!file) return fail("That figure was not found.", 404);
    return new NextResponse(fs.readFileSync(file), {
      headers: { "Content-Type": file.endsWith(".png") ? "image/png" : "image/jpeg", "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff" },
    });
  });
}
