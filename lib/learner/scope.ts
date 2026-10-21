import { nextAssessment } from "../vault/health";
import type { Assessment, Card, VaultIndex } from "../vault/types";
import { assessmentCards, nodeMasteries, type StateMap } from "./mastery";

/** How many of the lowest-mastery notes the "Weakest" scope pulls in. */
export const WEAKEST_NODE_COUNT = 5;

export type Scope =
  | { kind: "course" }
  | { kind: "next" }
  | { kind: "weakest" }
  | { kind: "assessment"; id: string }
  | { kind: "unit"; id: string }
  | { kind: "node"; id: string; neighbours: boolean };

/** Scopes travel in URLs and the attempts log as short strings: "unit:wk3", "node+:wiki/a.md". */
export function scopeToString(scope: Scope): string {
  switch (scope.kind) {
    case "assessment":
    case "unit":
      return `${scope.kind}:${scope.id}`;
    case "node":
      return `${scope.neighbours ? "node+" : "node"}:${scope.id}`;
    default:
      return scope.kind;
  }
}

export function parseScope(text: string | null | undefined): Scope | null {
  if (!text) return null;
  if (text === "course" || text === "next" || text === "weakest") return { kind: text };
  const separator = text.indexOf(":");
  const [kind, id] = separator === -1 ? [text, ""] : [text.slice(0, separator), text.slice(separator + 1)];
  if (!id) return null;
  if (kind === "assessment" || kind === "unit") return { kind, id };
  if (kind === "node" || kind === "node+") return { kind: "node", id, neighbours: kind === "node+" };
  return null;
}

export interface ResolvedScope {
  scope: Scope;
  label: string;
  cards: Card[];
  /** Set for assessment scopes: drives exam mode and the question mix. */
  assessment: Assessment | null;
  /** Units to favour when introducing new cards. */
  emphasis: string[];
}

export interface ScopeContext {
  /** YYYY-MM-DD, local. */
  today: string;
  states: StateMap;
  now: Date;
}

function forAssessment(index: VaultIndex, assessment: Assessment, scope: Scope): ResolvedScope {
  return { scope, label: assessment.label, cards: assessmentCards(index, assessment), assessment, emphasis: assessment.emphasis };
}

function weakestCards(index: VaultIndex, ctx: ScopeContext): Card[] {
  const weakest = nodeMasteries(index, ctx.states, ctx.now)
    // Only notes already studied: an untouched note is new, not weak.
    .filter((n) => n.mastery !== null && n.seenCount > 0)
    // Confident misses first, then lowest mastery.
    .sort((a, b) => b.confidentWrong - a.confidentWrong || a.mastery! - b.mastery!)
    .slice(0, WEAKEST_NODE_COUNT)
    .map((n) => n.nodeId);
  const chosen = new Set(weakest);
  return index.cards.filter((c) => chosen.has(c.nodeId));
}

function neighboursOf(index: VaultIndex, nodeId: string): Set<string> {
  const linked = index.edges.flatMap((e) => (e.from === nodeId ? [e.to] : e.to === nodeId ? [e.from] : []));
  return new Set([nodeId, ...linked]);
}

/** Turns a scope into the cards it covers. Returns null when it names something the vault does not have. */
export function resolveScope(index: VaultIndex, scope: Scope, ctx: ScopeContext): ResolvedScope | null {
  const plain = (label: string, cards: Card[]): ResolvedScope => ({ scope, label, cards, assessment: null, emphasis: [] });
  switch (scope.kind) {
    case "course":
      return plain("Whole course", index.cards);
    case "weakest":
      return plain("Weakest notes", weakestCards(index, ctx));
    case "next": {
      const upcoming = nextAssessment(index.assessments, ctx.today);
      return upcoming ? forAssessment(index, upcoming.assessment, scope) : null;
    }
    case "assessment": {
      const assessment = index.assessments.find((a) => a.id === scope.id);
      return assessment ? forAssessment(index, assessment, scope) : null;
    }
    case "unit": {
      const unit = index.units.find((u) => u.id === scope.id);
      return unit ? plain(unit.label, index.cards.filter((c) => c.unitIds.includes(unit.id))) : null;
    }
    case "node": {
      const node = index.nodes.find((n) => n.id === scope.id);
      if (!node) return null;
      const wanted = scope.neighbours ? neighboursOf(index, node.id) : new Set([node.id]);
      const label = scope.neighbours ? `${node.title} + linked notes` : node.title;
      return plain(label, index.cards.filter((c) => wanted.has(c.nodeId)));
    }
  }
}

/** The scope to open with: the next dated assessment when there is one, otherwise the whole course. */
export function defaultScope(index: VaultIndex, today: string): Scope {
  return nextAssessment(index.assessments, today) ? { kind: "next" } : { kind: "course" };
}
