import { redirect } from "next/navigation";
import MapView, { type MapFilter } from "@/components/map/MapView";
import { nodeMasteries } from "@/lib/learner/mastery";
import { scopeToString } from "@/lib/learner/scope";
import { getStudyContext } from "@/lib/learner/service";
import { sessionHref } from "@/lib/learner/session";
import { buildMapGraph } from "@/lib/map/graph";
import { nextAssessment } from "@/lib/vault/health";
import { libraryHref, shortTitle } from "@/lib/vault/render";

export default async function MapPage() {
  const ctx = await getStudyContext();
  if (!ctx) redirect("/vaults");
  const { index } = ctx;
  const upcoming = nextAssessment(index.assessments, ctx.today)?.assessment ?? null;
  const graph = buildMapGraph(index, nodeMasteries(index, ctx.states, ctx.now), upcoming);

  const filters: MapFilter[] = [
    { id: "all", label: "Everything", unitIds: [] },
    ...index.assessments.map((a) => ({ id: `assessment:${a.id}`, label: `Assessment: ${a.label}`, unitIds: a.covers })),
    ...index.units.map((u) => ({ id: `unit:${u.id}`, label: `Unit: ${u.label}`, unitIds: [u.id] })),
  ];

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <h1 className="text-3xl font-extrabold gradient-text mb-1">Map</h1>
      <p className="text-slate-500 text-sm mb-6">
        Every note in {index.course.name} and the links between them. Colour shows how well you know each one; it updates as you study.
      </p>
      {graph.nodes.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">This vault has no notes to map yet.</p>
      ) : (
        <MapView
          nodes={graph.nodes.map((node) => ({
            ...node,
            // The course is already named above the map.
            title: shortTitle(node.title),
            studyHref: sessionHref(scopeToString({ kind: "node", id: node.id, neighbours: false })),
            studyLinkedHref: sessionHref(scopeToString({ kind: "node", id: node.id, neighbours: true })),
            teachHref: `/teach?${new URLSearchParams({ node: node.id })}`,
            noteHref: libraryHref(node.slug),
          }))}
          edges={graph.edges}
          filters={filters}
        />
      )}
    </div>
  );
}
