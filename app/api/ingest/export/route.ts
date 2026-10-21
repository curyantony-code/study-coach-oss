import path from "path";
import { NextResponse } from "next/server";
import { fail, guarded } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { getPages } from "@/lib/ingest/store";
import { getActiveVault } from "@/lib/vault/active";

/** Everything read from one PDF as a single Markdown file. Figures are named, not embedded. */
export function GET(request: Request) {
  return guarded("Exporting a PDF's text", async () => {
    const file = new URL(request.url).searchParams.get("file") ?? "";
    const vault = await getActiveVault();
    const pages = vault ? getPages(getDb(), vault.id, file) : [];
    if (pages.length === 0) return fail("Nothing has been read from that PDF yet.", 404);
    const title = path.basename(file, path.extname(file));
    const body = [`# ${title}`, ...pages.map((page) => `<!-- page ${page.page} -->\n\n${page.markdown}`)].join("\n\n");
    const safeName = title.replace(/[^\w .-]+/g, " ").trim().slice(0, 120) || "pdf";
    return new NextResponse(body, {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${safeName}.md"`, "Cache-Control": "no-store" },
    });
  });
}
