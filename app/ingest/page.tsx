import Link from "next/link";
import { redirect } from "next/navigation";
import IngestRunner from "@/components/ingest/IngestRunner";
import { getDb } from "@/lib/db/client";
import { availableReader } from "@/lib/ingest/readers";
import { listDocs } from "@/lib/ingest/store";
import { listVaultPdfs } from "@/lib/problems/import";
import { getActiveContent } from "@/lib/vault/active";

export const dynamic = "force-dynamic";

const READER_NOTE = {
  mac: "Pictures are read with this Mac's built-in text reader. Nothing leaves this computer.",
  tesseract: "Pictures are read with Tesseract on this computer. It is less accurate than the Mac's reader on slides with coloured backgrounds.",
  none: "No text reader was found on this computer, so pictures are kept as pictures and their text is not read. PDFs with real text still work.",
} as const;

export default async function IngestPage() {
  const active = await getActiveContent();
  if (!active) redirect("/vaults");
  const docs = new Map(listDocs(getDb(), active.vault.id).map((doc) => [doc.file, doc]));
  const pdfs = listVaultPdfs(active.vault.path).sort((a, b) => Number(docs.has(b)) - Number(docs.has(a)) || a.localeCompare(b, undefined, { numeric: true }));
  const reader = (await availableReader()) ?? "none";

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <h1 className="text-3xl font-extrabold gradient-text mb-1">Read a PDF</h1>
      <p className="text-slate-500 text-sm mb-2">
        {active.index.course.name}: turns a PDF in this vault into text you can search and study from, including the screenshots inside it.
        Spreadsheet pictures become tables, slide pictures become text, and diagrams are kept as pictures.
      </p>
      <p className="mb-8 text-xs text-slate-500">{READER_NOTE[reader]} Your PDF is only read, and nothing is written into your vault.</p>

      {pdfs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">This vault has no PDFs.</p>
      ) : (
        <ul className="space-y-3">
          {pdfs.map((file) => {
            const doc = docs.get(file);
            const name = file.split("/").pop()!.replace(/\.pdf$/i, "");
            const folder = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
            return (
              <li key={file} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 break-words">{name}</p>
                    {folder && <p className="text-xs text-slate-400 break-all">{folder}</p>}
                  </div>
                  {doc && doc.done > 0 && (
                    <Link href={`/ingest/view?file=${encodeURIComponent(file)}`} className="shrink-0 rounded-xl border border-blue-300 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 active:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      Open ({doc.done} page{doc.done === 1 ? "" : "s"})
                    </Link>
                  )}
                </div>
                <div className="mt-3"><IngestRunner file={file} total={doc?.pages ?? 0} done={doc?.done ?? 0} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
