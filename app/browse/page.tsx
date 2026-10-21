import Link from "next/link";
import { redirect } from "next/navigation";
import { masteryTone } from "@/components/study/MasteryBar";
import { nodeMasteries } from "@/lib/learner/mastery";
import { getStudyContext } from "@/lib/learner/service";
import { libraryHref, shortTitle } from "@/lib/vault/render";
import type { Node, VaultIndex } from "@/lib/vault/types";

interface Group {
  id: string;
  title: string;
  hint: string;
  /** Reference material (hubs, glossaries) is listed more compactly than course notes. */
  compact: boolean;
  items: Node[];
}

const REFERENCE_UNIT = /^_|\b(hubs?|reference|resources|appendix|meta)\b/i;

function byTitle(a: Node, b: Node): number {
  return shortTitle(a.title).localeCompare(shortTitle(b.title), undefined, { numeric: true });
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function slugId(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "group";
}

/**
 * Course notes first, in unit order; then notes that sit outside every unit (index, review
 * sheets); reference hubs last. Typed wikis keep their Sources / Concepts / Entities split.
 */
function groupNodes(index: VaultIndex): Group[] {
  const { nodes, units } = index;
  if (index.style === "wiki-schema") {
    const of = (...types: Node["type"][]) => nodes.filter((n) => types.includes(n.type));
    return [
      { id: "sources", title: "Sources", hint: "Lectures and readings", compact: false, items: of("source").sort((a, b) => a.slug.localeCompare(b.slug, undefined, { numeric: true })) },
      { id: "concepts", title: "Concepts", hint: "Ideas that run across lectures", compact: false, items: of("concept").sort(byTitle) },
      { id: "entities", title: "Entities", hint: "Named models, theories and frameworks", compact: false, items: of("entity").sort(byTitle) },
      { id: "other", title: "Other pages", hint: "Overview and housekeeping", compact: true, items: of("overview", "note").sort(byTitle) },
    ].filter((g) => g.items.length > 0);
  }

  const inUnit = (unitId: string) => nodes.filter((n) => n.unitIds[0] === unitId).sort(byTitle);
  const course = units.filter((u) => !REFERENCE_UNIT.test(u.label));
  const reference = units.filter((u) => REFERENCE_UNIT.test(u.label));
  const loose = nodes.filter((n) => n.unitIds.length === 0).sort(byTitle);
  // When each unit is a single note, a heading per unit only repeats the note's title:
  // list the course notes together, in unit order.
  const courseNotes = course.flatMap((u) => inUnit(u.id));
  const oneNotePerUnit = course.length > 1 && courseNotes.length < course.length * 2;
  const courseGroups: Group[] = oneNotePerUnit
    ? [{ id: "course-notes", title: "Course notes", hint: "The main notes, in course order", compact: false, items: courseNotes }]
    : course.map((u) => ({ id: slugId(u.label), title: u.label, hint: "", compact: false, items: inUnit(u.id) }));
  return [
    ...courseGroups,
    { id: "overview", title: "Overview & review", hint: "Notes that span the whole course", compact: false, items: loose },
    ...reference.map((u) => ({ id: slugId(u.label), title: u.label.replace(/^_+/, "") + " & reference", hint: "Look-up sheets: formulas, glossary, trackers", compact: true, items: inUnit(u.id) })),
  ].filter((g) => g.items.length > 0);
}

export default async function LibraryPage() {
  const ctx = await getStudyContext();
  if (!ctx) redirect("/vaults");
  const { index } = ctx;
  const groups = groupNodes(index);
  const mastery = new Map(nodeMasteries(index, ctx.states, ctx.now).map((m) => [m.nodeId, m]));
  const counts = new Map<string, { cards: number; problems: number }>();
  for (const card of index.cards) {
    const current = counts.get(card.nodeId) ?? { cards: 0, problems: 0 };
    counts.set(card.nodeId, { cards: current.cards + 1, problems: current.problems + (card.type === "problem" ? 1 : 0) });
  }

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <h1 className="text-3xl font-extrabold gradient-text mb-2">Library</h1>
      <p className="text-slate-500 text-sm mb-6">
        {index.nodes.length} notes in {index.course.name}. Reading is for reference; it does not count as study.
      </p>

      {groups.length === 0 && <p className="text-sm text-slate-500">This vault has no notes to show.</p>}

      {groups.length > 1 && (
        <nav aria-label="Sections" className="flex flex-wrap gap-2 mb-10">
          {groups.map((g) => (
            <a key={g.id} href={`#${g.id}`}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              {g.title} <span className="text-slate-400 tabular-nums">{g.items.length}</span>
            </a>
          ))}
        </nav>
      )}

      <div className="space-y-14">
        {groups.map((group) => (
          <section key={group.id} id={group.id} aria-labelledby={`${group.id}-title`} className="scroll-mt-24">
            <div className="mb-4 border-b border-slate-200 pb-3">
              <h2 id={`${group.id}-title`} className="text-xl font-bold text-slate-900">{group.title}</h2>
              <p className="text-sm text-slate-500">
                {[group.hint, `${group.items.length} note${group.items.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
              </p>
            </div>
            <ul className={group.compact ? "grid sm:grid-cols-2 gap-3" : "grid md:grid-cols-2 gap-5"}>
              {group.items.map((node) => {
                const count = counts.get(node.id) ?? { cards: 0, problems: 0 };
                const stats = mastery.get(node.id);
                const tone = masteryTone(stats && stats.seenCount > 0 ? stats.mastery : stats?.mastery === null ? null : 0);
                const facts = [
                  count.cards - count.problems > 0 ? plural(count.cards - count.problems, "card") : null,
                  count.problems > 0 ? plural(count.problems, "problem") : null,
                ].filter(Boolean);
                return (
                  <li key={node.id}>
                    <Link href={libraryHref(node.slug)}
                      className={`group block h-full rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${group.compact ? "px-4 py-3" : "p-5"}`}>
                      <span className={`block font-semibold text-slate-900 group-hover:text-blue-700 ${group.compact ? "text-sm" : "text-base mb-2"}`}>{shortTitle(node.title)}</span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>{facts.length > 0 ? facts.join(" · ") : "Reading only"}</span>
                        {count.cards > 0 && (
                          <span className={`font-semibold ${tone.text}`}>
                            {stats && stats.seenCount > 0 && stats.mastery !== null ? `${Math.round(stats.mastery * 100)}% · ` : ""}{tone.word}
                          </span>
                        )}
                      </span>
                      {!group.compact && node.tags.length > 0 && (
                        <span className="mt-3 flex flex-wrap gap-1.5">
                          {node.tags.filter((t) => !/^[a-z]{2,5}\d{2,4}$/i.test(t)).slice(0, 4).map((t) => (
                            <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t}</span>
                          ))}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
