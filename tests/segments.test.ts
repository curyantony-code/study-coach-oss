import { describe, expect, it } from "vitest";
import { reviewSegments, segmentSignature } from "@/lib/vault/segments";
import type { Card, Node, Unit } from "@/lib/vault/types";

const unit = (id: string, label: string, order: number): Unit => ({ id, label, aliases: [], order });
const node = (id: string, unitIds: string[]): Node => ({ id, slug: id, title: `Note ${id}`, type: "note", tags: [], unitIds, sources: [], updated: "", body: "" });
const card = (nodeId: string, n: number) => ({ id: `${nodeId}-${n}`, nodeId } as Card);
const view = (units: Unit[], nodes: Node[], cards: Card[], hasManifest = false) => ({ units, nodes, cards, hasManifest, style: "generic" as const });

describe("reviewSegments", () => {
  it("lists each unit in order with its notes, cards and a few titles", () => {
    const review = reviewSegments(view([unit("t2", "Topic 2", 1), unit("t1", "Topic 1", 0)], [node("a", ["t1"]), node("b", ["t1"]), node("c", ["t2"])], [card("a", 1), card("a", 2), card("c", 1)]));
    expect(review.segments.map((s) => [s.label, s.notes, s.cards])).toEqual([["Topic 1", 2, 2], ["Topic 2", 1, 1]]);
    expect(review.segments[0].sample).toEqual(["Note a", "Note b"]);
    expect(review.concerns).toEqual([]);
    expect(review.basis).toMatch(/folder/);
  });

  it("points out a split by exam, folder names that are not topics, empty units and loose notes", () => {
    const nodes = [node("a", ["mid"]), node("b", ["fin"]), node("c", ["hubs"]), node("d", []), node("e", []), node("f", [])];
    const review = reviewSegments(view([unit("mid", "Midterm", 0), unit("fin", "Final", 1), unit("hubs", "_Hubs", 2)], nodes, [card("a", 1)]));
    const all = review.concerns.join(" ");
    expect(all).toMatch(/split by exam/);
    expect(all).toMatch(/“_Hubs” is a folder name/);
    expect(all).toMatch(/One unit has no flashcards yet: “Final”/);
    expect(all).toMatch(/3 of 6 notes are not in any unit/);
    expect(review.unplaced.count).toBe(3);
  });

  it("says so when nothing was split at all", () => {
    expect(reviewSegments(view([], [node("a", [])], [])).concerns[0]).toMatch(/No units were found/);
    expect(reviewSegments(view([unit("u", "Unit", 0)], [], [], true)).basis).toMatch(/study\.yml/);
  });
});

describe("segmentSignature", () => {
  it("changes when a unit is renamed or added, not when the order changes", () => {
    const a = segmentSignature({ units: [unit("t1", "Topic 1", 0), unit("t2", "Topic 2", 1)] });
    expect(segmentSignature({ units: [unit("t2", "Topic 2", 0), unit("t1", "Topic 1", 1)] })).toBe(a);
    expect(segmentSignature({ units: [unit("t1", "Topic One", 0), unit("t2", "Topic 2", 1)] })).not.toBe(a);
  });
});
