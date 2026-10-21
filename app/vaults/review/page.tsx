import Link from "next/link";
import { redirect } from "next/navigation";
import { confirmSegmentsAction } from "@/app/vaults/actions";
import { getDb } from "@/lib/db/client";
import { findVaults } from "@/lib/vault/discover";
import { checkVaultPath, findVaultByPath, getVault } from "@/lib/vault/registry";
import { reviewSegments } from "@/lib/vault/segments";
import { getVaultIndex, previewVaultIndex } from "@/lib/vault/store";

export const dynamic = "force-dynamic";

const CARD = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
const PRIMARY = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
const SECONDARY = "rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

/** Shows how a folder would be split into units and asks whether that is right, before it is added or studied. */
export default async function ReviewVaultPage({ searchParams }: { searchParams: Promise<{ path?: string; vault?: string }> }) {
  const params = await searchParams;
  const db = getDb();
  const check = params.path ? checkVaultPath(params.path) : null;
  // A folder that is already a vault is reviewed as that vault, so its saved wording and progress apply.
  const vault = (params.vault ? getVault(db, params.vault) : null) ?? (check?.ok ? findVaultByPath(db, check.path) : null);
  if (!vault && !check?.ok) redirect("/vaults");

  const folder = vault?.path ?? (check as { ok: true; path: string }).path;
  const index = vault ? getVaultIndex(vault) : previewVaultIndex(folder);
  const review = reviewSegments(index);
  // A folder that holds several vaults is usually a mistake: the courses inside were meant.
  const inside = findVaults([folder], []);
  const concerns = inside.length > 1
    ? [`This folder holds ${inside.length} separate vaults (${inside.slice(0, 4).map((v) => v.name).join(", ")}${inside.length > 4 ? ", …" : ""}). You probably want to add those one by one instead of this folder.`, ...review.concerns]
    : review.concerns;
  const biggest = Math.max(1, ...review.segments.map((s) => s.notes));

  return (
    <div className="max-w-3xl mx-auto animate-fade-in space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-500">{vault ? "Check this vault" : "Before adding this vault"}</p>
        <h1 className="text-3xl font-extrabold gradient-text mb-1">{index.course.name}</h1>
        <p className="text-xs text-slate-400 font-mono break-all">{folder}</p>
      </header>

      <section aria-labelledby="split" className={CARD}>
        <h2 id="split" className="text-lg font-bold text-slate-900">Is this split into the right units?</h2>
        <p className="mt-1 text-sm text-slate-600">
          Study Coach found {review.totals.notes} note{review.totals.notes === 1 ? "" : "s"} and {review.totals.cards} flashcard{review.totals.cards === 1 ? "" : "s"}, and split them into{" "}
          {review.segments.length} unit{review.segments.length === 1 ? "" : "s"} using {review.basis}. Units are what you study by, and what your progress and test coverage are shown by.
        </p>

        {concerns.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-bold text-amber-900">Worth a look</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-900">
              {concerns.map((concern) => <li key={concern}>{concern}</li>)}
            </ul>
          </div>
        )}

        {review.segments.length > 0 && (
          <ol className="mt-5 divide-y divide-slate-200">
            {review.segments.map((segment, i) => (
              <li key={segment.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold text-slate-900"><span className="mr-2 text-xs tabular-nums text-slate-400">{i + 1}</span>{segment.label}</p>
                  <p className="shrink-0 text-xs tabular-nums text-slate-500">{segment.notes} note{segment.notes === 1 ? "" : "s"} · {segment.cards} card{segment.cards === 1 ? "" : "s"}</p>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100" aria-hidden="true">
                  <div className={`h-1.5 rounded-full ${segment.cards === 0 ? "bg-amber-400" : "bg-blue-500"}`} style={{ width: `${Math.max(3, Math.round((segment.notes / biggest) * 100))}%` }} />
                </div>
                {segment.sample.length > 0 && (
                  <p className="mt-1.5 text-xs text-slate-500">{segment.sample.join(" · ")}{segment.notes > segment.sample.length ? ` · and ${segment.notes - segment.sample.length} more` : ""}</p>
                )}
              </li>
            ))}
          </ol>
        )}

        {review.unplaced.count > 0 && (
          <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-semibold">Not in any unit ({review.unplaced.count}):</span> {review.unplaced.sample.join(" · ")}{review.unplaced.count > review.unplaced.sample.length ? " · …" : ""}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
          <form action={confirmSegmentsAction}>
            {vault ? <input type="hidden" name="vaultId" value={vault.id} /> : <input type="hidden" name="path" value={folder} />}
            <button type="submit" className={PRIMARY}>{vault ? "Yes, this is right" : "Yes, this is right. Add the vault"}</button>
          </form>
          <Link href="/vaults" className={SECONDARY}>{vault ? "Not right, ask me again later" : "Not right, do not add it"}</Link>
        </div>

        <details className="mt-4 text-sm text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">How to change the split</summary>
          <p className="mt-2">Study Coach never rearranges your notes. The split follows the vault, so change it there and come back to this page:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Put each topic or week in its own folder, named for it (for example “Topic 3 - CAPM”).</li>
            <li>Or tag notes with the week or chapter (<code>#wk3</code>, <code>#ch7</code>), or add <code>week: 3</code> at the top of a note.</li>
            <li>Or list the units yourself in a <code>study.yml</code> file. {vault ? <Link href={`/vaults/${vault.id}#manifest`} className="font-semibold text-blue-700 underline underline-offset-2">This vault&apos;s page has a draft to start from.</Link> : "After adding the vault, its page offers a draft to start from."}</li>
          </ul>
        </details>
      </section>
    </div>
  );
}
