import { describe, expect, test } from "vitest";
import { nodeMasteries, type StateMap } from "@/lib/learner/mastery";
import { applyAnswer } from "@/lib/learner/schedule";
import { buildMapGraph, MAP_HEIGHT, MAP_WIDTH, masteryBand, radiusFor } from "@/lib/map/graph";
import { indexFixture } from "./helpers";

const NOW = new Date(2026, 1, 1, 10);
const MANIFEST = "course: { name: T }\nunits:\n  - { id: wk1, label: W1 }\n  - { id: wk2, label: W2 }\nassessments:\n  - { id: mid, label: Midterm, date: 2026-02-10, covers: [wk1], practice: [wiki/sources/practice-midterm1.md] }\n";
const index = indexFixture("wiki-vault", MANIFEST);
const graphFor = (states: StateMap = new Map()) => buildMapGraph(index, nodeMasteries(index, states, NOW), index.assessments[0]);

describe("map graph", () => {
  const graph = graphFor();
  const node = (id: string) => graph.nodes.find((n) => n.id === id)!;

  test("has one point per note, all inside the drawing area", () => {
    expect(graph.nodes).toHaveLength(index.nodes.length);
    for (const n of graph.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(MAP_WIDTH);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(MAP_HEIGHT);
    }
  });

  test("is the same every time for the same vault", () => {
    expect(graphFor().nodes.map((n) => [n.id, n.x, n.y])).toEqual(graph.nodes.map((n) => [n.id, n.x, n.y]));
  });

  test("does not stack notes on top of each other", () => {
    for (const a of graph.nodes) {
      for (const b of graph.nodes) {
        if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(5);
      }
    }
  });

  test("sizes notes by card count", () => {
    expect(node("wiki/entities/equity-theory.md").radius).toBeGreaterThan(node("wiki/sources/wk2-motivation.md").radius);
    expect(node("wiki/overview.md").radius).toBe(radiusFor(0));
    expect(radiusFor(10_000)).toBe(34);
  });

  test("marks notes the next assessment covers, including its practice notes", () => {
    expect(node("wiki/sources/wk1-intro.md").inNextAssessment).toBe(true);
    expect(node("wiki/sources/practice-midterm1.md").inNextAssessment).toBe(true);
    expect(node("wiki/entities/equity-theory.md").inNextAssessment).toBe(false);
    expect(buildMapGraph(index, nodeMasteries(index, new Map(), NOW), null).nodes.some((n) => n.inNextAssessment)).toBe(false);
  });

  test("links are listed from both ends", () => {
    expect(node("wiki/concepts/core-framework.md").linked.sort()).toEqual(["wiki/entities/equity-theory.md", "wiki/sources/wk1-intro.md"]);
    expect(node("wiki/sources/wk1-intro.md").linked).toContain("wiki/concepts/core-framework.md");
    expect(graph.edges).toEqual(index.edges);
  });

  test("a note's colour band changes after it is studied", () => {
    expect(masteryBand(node("wiki/overview.md"))).toBe("none");
    expect(masteryBand(node("wiki/sources/wk1-intro.md"))).toBe("unseen");

    const states: StateMap = new Map();
    for (const card of index.cards.filter((c) => c.nodeId === "wiki/sources/wk1-intro.md")) {
      states.set(card.id, applyAnswer(null, { cardId: card.id, nodePath: card.nodeId }, { correct: true, confidence: "certain" }, NOW, null));
    }
    const studied = graphFor(states).nodes.find((n) => n.id === "wiki/sources/wk1-intro.md")!;
    expect(masteryBand(studied)).toBe("strong");
    expect(masteryBand({ mastery: 0.2, unseen: false })).toBe("weak");
    expect(masteryBand({ mastery: 0.5, unseen: false })).toBe("middling");
  });
});
