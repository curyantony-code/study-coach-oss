import Link from "next/link";
import { redirect } from "next/navigation";
import PageMarkdown from "@/components/ingest/PageMarkdown";
import ReadAgainButton from "@/components/ingest/ReadAgainButton";
import { getDb } from "@/lib/db/client";
import { docKey } from "@/lib/ingest/service";
import { getDoc, getPages } from "@/lib/ingest/store";
import { getActiveContent } from "@/lib/vault/active";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = {
  text: "PDF text",
  mac: "pictures read on this Mac",
  tesseract: "pictures read with Tesseract",
  pictures: "pictures kept as pictures",
  failed: "could not be read",
};
const LINK = "text-sm font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export default async function IngestViewPage({ searchParams }: { searchParams: Promise<{ file?: string }> }) {
  const file = (await searchParams).file ?? "";
  const active = await getActiveContent();
  if (!active) redirect("/vaults");
  const doc = getDoc(getDb(), active.vault.id, file);
  const pages = doc ? getPages(getDb(), active.vault.id, file) : [];
  if (!doc || pages.length === 0) redirect("/ingest");

  const name = file.split("/").pop()!.replace(/\.pdf$/i, "");
  const figureBase = `/api/ingest/figure?doc=${docKey(file)}`;
  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <p className="mb-2"><Link href="/ingest" className={LINK}>← All PDFs</Link></p>
      <h1 className="text-2xl font-extrabold text-slate-900 break-words">{name}</h1>
      <p className="mt-1 mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
        <span>{doc.done} of {doc.pages} pages read</span>
        <a href={`/api/ingest/export?file=${encodeURIComponent(file)}`} download className={LINK}>Download as Markdown</a>
        <ReadAgainButton file={file} />
      </p>
      <ol className="space-y-5">
        {pages.map((page) => (
          <li key={page.page} id={`page-${page.page}`} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-3 flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2 text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-widest">Page {page.page}</span>
              <span>{METHOD_LABEL[page.method] ?? page.method}</span>
            </p>
            {page.markdown.trim() ? <PageMarkdown markdown={page.markdown} figureBase={figureBase} /> : <p className="text-sm text-slate-400">Nothing on this page.</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
