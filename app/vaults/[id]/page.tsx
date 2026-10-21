import Link from "next/link";
import { notFound } from "next/navigation";
import ManifestEditor from "@/components/vaults/ManifestEditor";
import { removeVaultAction, setWriteEnabledAction, switchVaultAction } from "@/app/vaults/actions";
import { getDb } from "@/lib/db/client";
import { getActiveVault } from "@/lib/vault/active";
import { draftManifest } from "@/lib/vault/draft";
import { readManifestText } from "@/lib/vault/files";
import { vaultHealth } from "@/lib/vault/health";
import { getVault } from "@/lib/vault/registry";
import { libraryHref } from "@/lib/vault/render";
import { getVaultIndex } from "@/lib/vault/store";
import type { Assessment, Unit } from "@/lib/vault/types";

const MAX_LISTED = 12;
const STYLE_TEXT = {
  "wiki-schema": "Wiki vault — pages typed as sources, concepts and entities under wiki/.",
  generic: "Ordinary Obsidian vault — units come from folders, tags and note properties.",
} as const;

const CARD = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";
const H2 = "text-lg font-bold text-slate-900";

function Stat({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "amber" }) {
  const border = tone === "amber" && value > 0 ? "border-l-amber-400" : "border-l-blue-400";
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 border-l-4 ${border} p-4 shadow-sm`}>
      <div className="text-3xl font-bold text-slate-800 tabular-nums">{value}</div>
      <div className="text-sm text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function coverText(assessment: Assessment, units: Unit[]): string {
  if (assessment.cumulative) return "Everything (cumulative)";
  const labels = new Map(units.map((u) => [u.id, u.label]));
  return assessment.covers.map((id) => labels.get(id) ?? id).join(" · ") || "No units yet";
}

export default async function VaultHealthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vault = getVault(getDb(), id);
  if (!vault) notFound();

  const index = getVaultIndex(vault);
  const health = vaultHealth(index);
  const active = await getActiveVault();
  const isActive = active?.id === vault.id;
  const existingManifest = readManifestText(vault.path);
  const mostCards = Math.max(1, ...health.units.map((u) => u.cardCount));

  return (
    <div className="max-w-4xl mx-auto animate-fade-in space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/vaults" className="hover:text-slate-800 underline-offset-2 hover:underline">Vaults</Link>
        <span aria-hidden="true">/</span>
        <span className="text-slate-700 font-medium">{vault.name}</span>
      </nav>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold text-slate-900">{index.course.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {[index.course.code, index.course.term, index.course.textbook].filter(Boolean).join(" · ") || vault.name}
          </p>
          <p className="text-xs text-slate-400 font-mono mt-1 break-all">{vault.path}</p>
          <p className="text-sm text-slate-600 mt-2">{STYLE_TEXT[index.style]}</p>
        </div>
        {isActive ? (
          <span className="text-xs font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-full">Studying now</span>
        ) : (
          <form action={switchVaultAction}>
            <input type="hidden" name="vaultId" value={vault.id} />
            <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500">
              Study this vault
            </button>
          </form>
        )}
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Units" value={index.units.length} />
        <Stat label="Notes" value={index.nodes.length} />
        <Stat label="Cards" value={index.cards.length} />
        <Stat label="Links between notes" value={index.edges.length} />
      </div>

      {index.warnings.length > 0 && (
        <section aria-labelledby="to-check" className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 id="to-check" className="text-sm font-bold text-amber-900 mb-2">Things to check</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-amber-900">
            {index.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </section>
      )}

      <section aria-labelledby="units" className={CARD}>
        <h2 id="units" className={H2}>Units</h2>
        <p className="text-sm text-slate-500 mb-4">Chapters, weeks or modules. A note can sit in more than one.</p>
        {health.units.length === 0 ? (
          <p className="text-sm text-slate-500">None found yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                <th scope="col" className="pb-2 font-semibold">Unit</th>
                <th scope="col" className="pb-2 font-semibold text-right w-16">Notes</th>
                <th scope="col" className="pb-2 font-semibold text-right w-16">Cards</th>
                <th scope="col" className="pb-2 w-32"><span className="sr-only">Share of cards</span></th>
              </tr>
            </thead>
            <tbody>
              {health.units.map(({ unit, nodeCount, cardCount }) => (
                <tr key={unit.id} className="border-t border-slate-100">
                  <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-800">
                    {unit.label}
                    <span className="ml-2 text-xs font-mono font-normal text-slate-400">{[unit.id, ...unit.aliases].join(" = ")}</span>
                  </th>
                  <td className="py-2 text-right tabular-nums text-slate-700">{nodeCount}</td>
                  <td className={`py-2 text-right tabular-nums ${cardCount === 0 ? "text-amber-700 font-semibold" : "text-slate-700"}`}>{cardCount}</td>
                  <td className="py-2 pl-4">
                    <div className="h-2 rounded-full bg-slate-100" aria-hidden="true">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: `${(cardCount / mostCards) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="assessments" className={CARD}>
        <h2 id="assessments" className={H2}>Assessments</h2>
        <p className="text-sm text-slate-500 mb-4">Tests, midterms and finals, from study.yml.</p>
        {index.assessments.length === 0 ? (
          <p className="text-sm text-slate-500">None yet. Add them in study.yml below.</p>
        ) : (
          <ul className="space-y-3">
            {index.assessments.map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <h3 className="font-semibold text-slate-900">{a.label}</h3>
                  <span className={`text-sm font-medium ${a.date ? "text-slate-700" : "text-amber-700"}`}>{a.date ?? "No date set"}</span>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  {[a.weight !== undefined ? `${a.weight}% of grade` : null, a.format.join(", ") || null].filter(Boolean).join(" · ")}
                </p>
                <p className="text-sm text-slate-500 mt-1">Covers: {coverText(a, index.units)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="notes" className={CARD}>
        <h2 id="notes" className={H2}>Notes</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-4 text-sm">
          {[
            { title: "Not in any unit", items: health.orphans.map((n) => ({ key: n.id, text: n.title, href: libraryHref(n.slug) })) },
            { title: "No cards found", items: health.nodesWithoutCards.map((n) => ({ key: n.id, text: n.title, href: libraryHref(n.slug) })) },
            { title: "Unclear questions", items: health.unclearQuestions.map(({ card, issues }) => ({ key: card.id, text: `${card.problem!.heading}: ${issues[0].message}`, href: `/problems/${card.id}` })) },
            { title: "Broken links", items: index.brokenLinks.map((b) => ({ key: `${b.from}→${b.target}`, text: `[[${b.target}]] in ${b.from}`, href: null })) },
          ].map((group) => (
            <div key={group.title}>
              <h3 className="font-semibold text-slate-800 mb-2">
                {group.title} <span className="text-slate-400 font-normal tabular-nums">({group.items.length})</span>
              </h3>
              {group.items.length === 0 ? (
                <p className="text-slate-400">None</p>
              ) : (
                <ul className="space-y-1">
                  {group.items.slice(0, MAX_LISTED).map((item) => (
                    <li key={item.key} className="text-slate-600 break-words">
                      {item.href && isActive ? (
                        <Link href={item.href} className="text-indigo-700 underline-offset-2 hover:underline">{item.text}</Link>
                      ) : (
                        item.text
                      )}
                    </li>
                  ))}
                  {group.items.length > MAX_LISTED && <li className="text-slate-400">…and {group.items.length - MAX_LISTED} more</li>}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="manifest" className={CARD}>
        <h2 id="manifest" className={H2}>study.yml</h2>
        <p className="text-sm text-slate-500 mb-4">
          {existingManifest === null
            ? "This vault has no study.yml yet. Below is a draft made from what was found. Check it, add your assessments, then save."
            : "This file lives in your vault and tells Study Coach about the course, units and assessments. You can also edit it in Obsidian."}
        </p>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="text-sm min-w-0">
            <div className="font-semibold text-slate-800">
              Allow writing to this vault: <span className={vault.writeEnabled ? "text-emerald-700" : "text-slate-500"}>{vault.writeEnabled ? "On" : "Off"}</span>
            </div>
            <p className="text-slate-500 mt-0.5">
              Off by default. When on, Study Coach may save study.yml here, and only after you tick the confirmation each time.
            </p>
          </div>
          <form action={setWriteEnabledAction}>
            <input type="hidden" name="vaultId" value={vault.id} />
            <input type="hidden" name="enabled" value={vault.writeEnabled ? "0" : "1"} />
            <button type="submit" className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 active:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              {vault.writeEnabled ? "Turn off" : "Turn on"}
            </button>
          </form>
        </div>

        <ManifestEditor
          vaultId={vault.id}
          initialYaml={existingManifest ?? draftManifest(index)}
          replaces={existingManifest !== null}
          writeEnabled={vault.writeEnabled}
        />
      </section>

      <section aria-labelledby="remove" className="rounded-2xl border border-slate-200 bg-white p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="text-sm">
          <h2 id="remove" className="font-semibold text-slate-800">Remove from Study Coach</h2>
          <p className="text-slate-500">Takes this vault off the list. Your vault folder and notes are not touched.</p>
        </div>
        <form action={removeVaultAction}>
          <input type="hidden" name="vaultId" value={vault.id} />
          <button type="submit" className="rounded-xl border border-rose-300 px-3.5 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 active:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
            Remove vault
          </button>
        </form>
      </section>
    </div>
  );
}
