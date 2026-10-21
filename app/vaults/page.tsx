import Link from "next/link";
import AddVaultForm from "@/components/vaults/AddVaultForm";
import { switchVaultAction } from "@/app/vaults/actions";
import { getActiveVault, getVaults } from "@/lib/vault/active";
import { findVaults, searchRoots } from "@/lib/vault/discover";
import { listObsidianVaults } from "@/lib/vault/obsidian";
import { segmentsConfirmed } from "@/lib/vault/segments";
import { getVaultIndex } from "@/lib/vault/store";

const STYLE_LABEL = { "wiki-schema": "Wiki vault", generic: "Obsidian vault" } as const;

export default async function VaultsPage() {
  const vaults = getVaults();
  const active = await getActiveVault();
  const added = new Set(vaults.map((v) => v.path));
  // Looked for by itself: vaults Obsidian knows, and vault-looking folders near the ones already added.
  const fromObsidian = listObsidianVaults().filter((v) => !added.has(v.path));
  const nearby = findVaults(searchRoots([...added, ...fromObsidian.map((v) => v.path)]), [...added]);
  const suggestions = [
    ...nearby,
    ...fromObsidian.filter((v) => !nearby.some((n) => n.path === v.path)).map((v) => ({ ...v, because: "known to Obsidian", inside: "" })),
  ];

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <h1 className="text-3xl font-extrabold gradient-text mb-1">Vaults</h1>
      <p className="text-slate-500 text-sm mb-8">
        A vault is an Obsidian folder you study from. Study Coach only reads it; each vault keeps its own progress.
      </p>

      <section aria-labelledby="your-vaults" className="mb-10">
        <h2 id="your-vaults" className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Your vaults</h2>
        {vaults.length === 0 && (
          <div className="rounded-3xl border border-blue-200 bg-white p-6 shadow-sm">
            <p className="text-lg font-bold text-slate-900">Welcome. Start with your first course.</p>
            <p className="mt-1 text-sm text-slate-600">Study Coach turns a course&apos;s material into flashcards, quizzes, mock exams and a day-by-day plan. Pick how you want to bring a course in.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link href="/build" className="rounded-2xl border border-blue-300 bg-blue-50 p-4 hover:bg-blue-100 active:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <span className="block text-sm font-bold text-blue-900">I have course files</span>
                <span className="mt-1 block text-sm text-blue-900">Add the outline, slides, notes and textbook. Study Coach sorts them and builds the course for you.</span>
              </Link>
              <a href="#add-vault" className="rounded-2xl border border-slate-300 bg-white p-4 hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <span className="block text-sm font-bold text-slate-900">I already have an Obsidian vault</span>
                <span className="mt-1 block text-sm text-slate-600">Point Study Coach at the folder. It is only read, never changed.</span>
              </a>
            </div>
          </div>
        )}
        <ul className="space-y-3">
          {vaults.map((vault) => {
            const index = getVaultIndex(vault);
            const isActive = vault.id === active?.id;
            return (
              <li key={vault.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${isActive ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-slate-900">{vault.name}</h3>
                      {isActive && <span className="text-xs font-semibold bg-blue-600 text-white px-2 py-0.5 rounded-full">Studying now</span>}
                      <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{STYLE_LABEL[index.style]}</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">{index.course.name}</p>
                    <p className="text-xs text-slate-400 font-mono mt-1 break-all">{vault.path}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isActive && (
                      <form action={switchVaultAction}>
                        <input type="hidden" name="vaultId" value={vault.id} />
                        <button type="submit" className="rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500">
                          Study this
                        </button>
                      </form>
                    )}
                    <Link href={`/vaults/${vault.id}`} className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      Health check
                    </Link>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                  {[
                    ["Units", index.units.length],
                    ["Assessments", index.assessments.length],
                    ["Notes", index.nodes.length],
                    ["Cards", index.cards.length],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline gap-2">
                      <dd className="text-xl font-bold text-slate-800 tabular-nums">{value}</dd>
                      <dt className="text-slate-500">{label}</dt>
                    </div>
                  ))}
                </dl>
                {!segmentsConfirmed(vault.id, index) && (
                  <p className="mt-3 mr-2 text-xs text-blue-900 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 inline-block">
                    Is this split into the right units?{" "}
                    <Link href={`/vaults/review?vault=${vault.id}`} className="font-semibold underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Check the {index.units.length} unit{index.units.length === 1 ? "" : "s"}</Link>
                  </p>
                )}
                {index.warnings.length > 0 && (
                  <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 inline-block">
                    {index.warnings.length} thing{index.warnings.length === 1 ? "" : "s"} to check — see the health check
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="add-vault" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 id="add-vault" className="text-lg font-bold text-slate-900 mb-4">Add a vault</h2>
        {suggestions.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-slate-700">Found on this computer</p>
            <p className="text-xs text-slate-500 mb-2">Folders near your vaults that look like vaults. Nothing is added until you have checked how it is split.</p>
            <ul className="space-y-2">
              {suggestions.map((s) => (
                <li key={s.path} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800">{s.name}{s.inside && <span className="ml-2 text-xs font-medium text-slate-500">in {s.inside}</span>}<span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{s.because}</span></div>
                    <div className="text-xs text-slate-400 font-mono break-all">{s.path}</div>
                  </div>
                  <Link href={`/vaults/review?path=${encodeURIComponent(s.path)}`} className="shrink-0 rounded-xl border border-blue-300 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 active:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    Review &amp; add
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <AddVaultForm />
        <p className="mt-4 text-sm text-slate-600">
          No vault yet, only files?{" "}
          <Link href="/build" className="font-semibold text-blue-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Build a course from your files</Link>
          : outlines, slides, notes and textbooks are sorted into a new vault per course.
        </p>
      </section>
    </div>
  );
}
