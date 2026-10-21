"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MAP_HEIGHT, MAP_WIDTH, masteryBand, type MapEdge, type MapNode, type MasteryBand } from "@/lib/map/graph";

export interface MapFilter {
  id: string;
  label: string;
  /** Unit ids a note must share to match (empty for "everything"). */
  unitIds: string[];
}

interface Props {
  nodes: (MapNode & { studyHref: string; studyLinkedHref: string; teachHref: string; noteHref: string })[];
  edges: MapEdge[];
  filters: MapFilter[];
}

const BAND: Record<MasteryBand, { label: string; fill: string; stroke: string; tile: string }> = {
  none: { label: "No cards", fill: "#f8fafc", stroke: "#cbd5e1", tile: "bg-slate-50 border-slate-300 text-slate-500" },
  unseen: { label: "Not started", fill: "#cbd5e1", stroke: "#94a3b8", tile: "bg-slate-200 border-slate-300 text-slate-700" },
  weak: { label: "Weak", fill: "#f43f5e", stroke: "#be123c", tile: "bg-rose-100 border-rose-300 text-rose-900" },
  middling: { label: "Getting there", fill: "#f59e0b", stroke: "#b45309", tile: "bg-amber-100 border-amber-300 text-amber-900" },
  strong: { label: "Strong", fill: "#10b981", stroke: "#047857", tile: "bg-emerald-100 border-emerald-300 text-emerald-900" },
};
const BAND_ORDER: MasteryBand[] = ["weak", "middling", "strong", "unseen", "none"];
const LABEL_LIMIT = 26;
const SHOW_ALL_LABELS_UNDER = 45;

function describe(node: MapNode): string {
  const band = BAND[masteryBand(node)].label;
  const mastery = node.mastery === null || node.unseen ? band : `${Math.round(node.mastery * 100)}% mastered, ${band.toLowerCase()}`;
  return `${node.title}: ${node.cards} card${node.cards === 1 ? "" : "s"}, ${mastery}${node.inNextAssessment ? ", in the next assessment" : ""}`;
}

const START = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
const ALT = "rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export default function MapView({ nodes, edges, filters }: Props) {
  const [filterId, setFilterId] = useState(filters[0]?.id ?? "all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filter = filters.find((f) => f.id === filterId) ?? filters[0];
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const matches = (node: MapNode) => !filter || filter.unitIds.length === 0 || node.unitIds.some((u) => filter.unitIds.includes(u));
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const showAllLabels = nodes.length < SHOW_ALL_LABELS_UNDER;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label htmlFor="map-filter" className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Show</label>
          <select id="map-filter" value={filterId} onChange={(event) => setFilterId(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            {filters.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Colour key">
          {BAND_ORDER.map((band) => (
            <li key={band} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border" style={{ background: BAND[band].fill, borderColor: BAND[band].stroke }} />
              {BAND[band].label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border-2 border-blue-600 bg-white" />
            In the next assessment
          </li>
        </ul>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="group" aria-label="Map of notes. Bigger circles have more cards; colour shows mastery." className="block w-full h-auto">
            <g stroke="#cbd5e1" strokeWidth={1.5}>
              {edges.map((edge) => {
                const [a, b] = [byId.get(edge.from), byId.get(edge.to)];
                if (!a || !b) return null;
                const touchesSelected = selectedId !== null && (edge.from === selectedId || edge.to === selectedId);
                const dim = !matches(a) || !matches(b);
                return <line key={`${edge.from}→${edge.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={touchesSelected ? "#2563eb" : undefined} strokeWidth={touchesSelected ? 2.5 : undefined} opacity={dim ? 0.15 : 1} />;
              })}
            </g>
            {nodes.map((node) => {
              const band = BAND[masteryBand(node)];
              const isSelected = node.id === selectedId;
              const dim = !matches(node);
              const label = node.title.length > LABEL_LIMIT ? `${node.title.slice(0, LABEL_LIMIT - 1)}…` : node.title;
              return (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={describe(node)}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedId(node.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(node.id);
                    }
                  }}
                  opacity={dim ? 0.2 : 1}
                  className="map-node cursor-pointer focus:outline-none"
                >
                  {node.inNextAssessment && <circle cx={node.x} cy={node.y} r={node.radius + 5} fill="none" stroke="#2563eb" strokeWidth={2.5} />}
                  <circle cx={node.x} cy={node.y} r={node.radius} fill={band.fill} stroke={isSelected ? "#0f172a" : band.stroke} strokeWidth={isSelected ? 4 : 1.5} className="map-node-dot" />
                  {(showAllLabels || isSelected) && (
                    <text x={node.x} y={node.y + node.radius + 16} textAnchor="middle" fontSize={13} fontWeight={isSelected ? 700 : 500} fill="#334155" stroke="#ffffff" strokeWidth={4} paintOrder="stroke">
                      {label}
                    </text>
                  )}
                  <title>{describe(node)}</title>
                </g>
              );
            })}
          </svg>
        </div>

        <aside aria-live="polite" className="rounded-3xl border border-slate-200 bg-white shadow-sm p-5">
          {selected ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">{BAND[masteryBand(selected)].label}</p>
              <h2 className="text-lg font-bold text-slate-900 mb-1">{selected.title}</h2>
              <p className="text-sm text-slate-600 mb-4">
                {selected.cards} card{selected.cards === 1 ? "" : "s"}
                {selected.mastery !== null && !selected.unseen ? ` · ${Math.round(selected.mastery * 100)}% mastered` : ""}
                {selected.inNextAssessment ? " · in the next assessment" : ""}
              </p>
              <div className="flex flex-wrap gap-2 mb-5">
                {selected.cards > 0 && <Link href={selected.studyHref} className={START}>Study this note</Link>}
                {selected.linked.length > 0 && <Link href={selected.studyLinkedHref} className={ALT}>Study with linked notes</Link>}
                <Link href={selected.teachHref} className={ALT}>Teach it back</Link>
                <Link href={selected.noteHref} className={ALT}>Open note</Link>
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Linked notes ({selected.linked.length})</h3>
              {selected.linked.length === 0 ? (
                <p className="text-sm text-slate-500">None.</p>
              ) : (
                <ul className="space-y-1">
                  {selected.linked.map((id) => byId.get(id)).filter((n): n is NonNullable<typeof n> => Boolean(n)).map((n) => (
                    <li key={n.id}>
                      <button type="button" onClick={() => setSelectedId(n.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                        <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border" style={{ background: BAND[masteryBand(n)].fill, borderColor: BAND[masteryBand(n)].stroke }} />
                        <span className="min-w-0 truncate">{n.title}</span>
                        <span className="ml-auto shrink-0 text-xs text-slate-500">{BAND[masteryBand(n)].label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-600">Pick a note on the map (or in the grid below) to see how well you know it and to study it.</p>
          )}
        </aside>
      </div>

      <section aria-labelledby="map-grid" className="mt-8">
        <h2 id="map-grid" className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">All notes, by mastery</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {nodes.filter(matches).sort((a, b) => BAND_ORDER.indexOf(masteryBand(a)) - BAND_ORDER.indexOf(masteryBand(b)) || (a.mastery ?? 0) - (b.mastery ?? 0)).map((node) => {
            const band = BAND[masteryBand(node)];
            return (
              <li key={node.id}>
                <button type="button" onClick={() => setSelectedId(node.id)} aria-pressed={node.id === selectedId}
                  className={`w-full rounded-xl border px-3 py-2 text-left hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${band.tile} ${node.id === selectedId ? "ring-2 ring-slate-900" : ""}`}>
                  <span className="block text-sm font-medium line-clamp-2">{node.title}</span>
                  <span className="block text-xs opacity-80">
                    {node.mastery !== null && !node.unseen ? `${Math.round(node.mastery * 100)}% · ` : ""}{band.label}{node.inNextAssessment ? " · next test" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
