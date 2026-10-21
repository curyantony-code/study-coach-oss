// Turns a vault's notes and links into a picture: where each note sits, how big it is
// (card count), how well it is known (mastery) and whether the next assessment covers it.
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import type { NodeMastery } from "../learner/mastery";
import type { Assessment, VaultIndex } from "../vault/types";

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 640;
const PADDING = 60;
const MIN_RADIUS = 9;
const MAX_RADIUS = 34;
const LAYOUT_TICKS = 300;

export interface MapNode {
  id: string;
  slug: string;
  title: string;
  unitIds: string[];
  cards: number;
  /** 0–1, or null when the note has no cards. */
  mastery: number | null;
  /** True when no card of this note has been studied yet. */
  unseen: boolean;
  /** Covered by the next upcoming assessment. */
  inNextAssessment: boolean;
  /** Ids of notes linked to or from this one. */
  linked: string[];
  x: number;
  y: number;
  radius: number;
}

export interface MapEdge {
  from: string;
  to: string;
}

export interface MapGraph {
  nodes: MapNode[];
  edges: MapEdge[];
}

/** Bigger notes hold more cards; the square root keeps one huge note from dwarfing the rest. */
export function radiusFor(cards: number): number {
  return Math.min(MAX_RADIUS, MIN_RADIUS + Math.sqrt(cards) * 3);
}

interface LayoutNode extends SimulationNodeDatum {
  id: string;
  radius: number;
}

/** Stretches the simulated positions to fill the drawing area, keeping every circle inside it. */
function fit(nodes: LayoutNode[]): Map<string, { x: number; y: number }> {
  const xs = nodes.map((n) => n.x ?? 0);
  const ys = nodes.map((n) => n.y ?? 0);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = (value: number, min: number, max: number, size: number) =>
    max - min < 1e-6 ? size / 2 : PADDING + ((value - min) / (max - min)) * (size - 2 * PADDING);
  return new Map(nodes.map((n) => [n.id, { x: scale(n.x ?? 0, minX, maxX, MAP_WIDTH), y: scale(n.y ?? 0, minY, maxY, MAP_HEIGHT) }]));
}

export function buildMapGraph(index: VaultIndex, masteries: NodeMastery[], nextAssessment: Assessment | null): MapGraph {
  const byNode = new Map(masteries.map((m) => [m.nodeId, m]));
  const covered = new Set(nextAssessment?.covers ?? []);
  const practice = new Set(nextAssessment?.practice ?? []);
  const ids = new Set(index.nodes.map((n) => n.id));
  const edges = index.edges.filter((e) => ids.has(e.from) && ids.has(e.to));

  const layoutNodes: LayoutNode[] = index.nodes.map((n) => ({ id: n.id, radius: radiusFor(byNode.get(n.id)?.cardCount ?? 0) }));
  const links: SimulationLinkDatum<LayoutNode>[] = edges.map((e) => ({ source: e.from, target: e.to }));
  // d3-force places nodes on a fixed spiral and uses a seeded generator, so the same vault
  // always produces the same map.
  forceSimulation(layoutNodes)
    .force("link", forceLink<LayoutNode, SimulationLinkDatum<LayoutNode>>(links).id((n) => n.id).distance(90).strength(0.5))
    .force("charge", forceManyBody().strength(-260))
    .force("collide", forceCollide<LayoutNode>().radius((n) => n.radius + 14))
    .force("center", forceCenter(0, 0))
    // A wide canvas: pull harder vertically so the map uses the width.
    .force("x", forceX(0).strength(0.03))
    .force("y", forceY(0).strength(0.07))
    .stop()
    .tick(LAYOUT_TICKS);
  const positions = fit(layoutNodes);

  const linked = new Map<string, Set<string>>();
  for (const { from, to } of edges) {
    linked.set(from, (linked.get(from) ?? new Set()).add(to));
    linked.set(to, (linked.get(to) ?? new Set()).add(from));
  }

  const nodes = index.nodes.map((node) => {
    const stats = byNode.get(node.id);
    return {
      id: node.id,
      slug: node.slug,
      title: node.title,
      unitIds: node.unitIds,
      cards: stats?.cardCount ?? 0,
      mastery: stats?.mastery ?? null,
      unseen: (stats?.seenCount ?? 0) === 0,
      inNextAssessment: practice.has(node.id) || node.unitIds.some((u) => covered.has(u)),
      linked: [...(linked.get(node.id) ?? [])],
      ...positions.get(node.id)!,
      radius: radiusFor(stats?.cardCount ?? 0),
    };
  });
  return { nodes, edges };
}

export type MasteryBand = "none" | "unseen" | "weak" | "middling" | "strong";

/** The colour band of a note. Bands, not a smooth scale, so each has a name the page can print. */
export function masteryBand(node: Pick<MapNode, "mastery" | "unseen">): MasteryBand {
  if (node.mastery === null) return "none";
  if (node.unseen) return "unseen";
  if (node.mastery < 0.4) return "weak";
  return node.mastery < 0.7 ? "middling" : "strong";
}
