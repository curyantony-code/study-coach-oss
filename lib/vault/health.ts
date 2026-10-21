import { questionIssues, type QuestionIssue } from "../questions/rules";
import type { Assessment, Card, Node, Unit, VaultIndex } from "./types";

export interface UnitHealth {
  unit: Unit;
  nodeCount: number;
  cardCount: number;
}

export interface VaultHealth {
  units: UnitHealth[];
  /** Notes that belong to no unit. */
  orphans: Node[];
  /** Notes no card could be made from. */
  nodesWithoutCards: Node[];
  cardsByNode: Map<string, number>;
  /** Worked problems whose question breaks the project rule (see lib/questions/rules.ts). */
  unclearQuestions: { card: Card; issues: QuestionIssue[] }[];
}

export function vaultHealth(index: VaultIndex): VaultHealth {
  const cardsByNode = new Map<string, number>();
  for (const card of index.cards) cardsByNode.set(card.nodeId, (cardsByNode.get(card.nodeId) ?? 0) + 1);

  const units = index.units.map((unit) => {
    const nodes = index.nodes.filter((n) => n.unitIds.includes(unit.id));
    return {
      unit,
      nodeCount: nodes.length,
      cardCount: nodes.reduce((sum, n) => sum + (cardsByNode.get(n.id) ?? 0), 0),
    };
  });

  return {
    units,
    orphans: index.nodes.filter((n) => n.unitIds.length === 0),
    nodesWithoutCards: index.nodes.filter((n) => !cardsByNode.has(n.id)),
    cardsByNode,
    // Judged on the note's own wording: a card showing a textbook or completed wording is already fixed.
    unclearQuestions: index.cards.flatMap((card) => {
      if (card.type !== "problem" || !card.problem || card.problem.original || card.problem.versions) return [];
      const issues = questionIssues(card.front, card.back, card.problem.heading);
      return issues.length > 0 ? [{ card, issues }] : [];
    }),
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface UpcomingAssessment {
  assessment: Assessment;
  daysAway: number;
}

/** The soonest dated assessment that has not happened yet. `today` is YYYY-MM-DD. */
export function nextAssessment(assessments: Assessment[], today: string): UpcomingAssessment | null {
  const upcoming = assessments
    .filter((a): a is Assessment & { date: string } => a.date !== null && a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length === 0) return null;
  const daysAway = Math.round((Date.parse(upcoming[0].date) - Date.parse(today)) / MS_PER_DAY);
  return { assessment: upcoming[0], daysAway };
}

export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
