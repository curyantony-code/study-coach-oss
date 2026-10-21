import { describe, expect, test } from "vitest";
import { courseBrief, splitEarlyLate } from "@/lib/course";
import type { Unit } from "@/lib/vault/types";

const unit = (id: string, order: number): Unit => ({ id, label: `Unit ${id}`, aliases: [], order });
const units = [unit("c", 3), unit("a", 1), unit("b", 2), unit("d", 4), unit("e", 5)];
const note = (name: string, ...unitIds: string[]) => ({ name, unitIds });
const ids = (n: { unitIds: string[] }) => n.unitIds;

describe("splitEarlyLate", () => {
  test("the first two fifths of the units are the earlier part", () => {
    const notes = [note("n1", "a"), note("n2", "b"), note("n3", "c"), note("n4", "d"), note("n5", "e")];
    const halves = splitEarlyLate(units, notes, ids);
    expect(halves.early.map((n) => n.name)).toEqual(["n1", "n2"]);
    expect(halves.late.map((n) => n.name)).toEqual(["n3", "n4", "n5"]);
    expect(halves.earlyLabel).toBe("Unit a to Unit b");
    expect(halves.lateLabel).toBe("Unit c to Unit e");
  });

  test("notes without a unit, or spanning both parts, count as later", () => {
    const notes = [note("n1", "a"), note("loose"), note("both", "a", "e"), note("n5", "e")];
    const halves = splitEarlyLate(units, notes, ids);
    expect(halves.early.map((n) => n.name)).toEqual(["n1"]);
    expect(halves.late.map((n) => n.name)).toEqual(["loose", "both", "n5"]);
  });

  test("two units give one each", () => {
    const halves = splitEarlyLate([unit("a", 1), unit("b", 2)], [note("n1", "a"), note("n2", "b")], ids);
    expect(halves.early).toHaveLength(1);
    expect(halves.late).toHaveLength(1);
  });

  test("a vault with no units is split by the order of its notes", () => {
    const notes = [note("n1"), note("n2"), note("n3"), note("n4"), note("n5")];
    const halves = splitEarlyLate([], notes, ids);
    expect(halves.early.map((n) => n.name)).toEqual(["n1", "n2"]);
    expect(halves.late).toHaveLength(3);
  });

  test("when every note spans early and late units, the notes are split by order instead", () => {
    const notes = [note("n1", "a", "e"), note("n2", "a", "d"), note("n3", "b", "e")];
    const halves = splitEarlyLate(units, notes, ids);
    expect(halves.early.map((n) => n.name)).toEqual(["n1"]);
    expect(halves.late.map((n) => n.name)).toEqual(["n2", "n3"]);
  });

  test("a single note is used for both parts", () => {
    const halves = splitEarlyLate([], [note("only")], ids);
    expect(halves.early).toHaveLength(1);
    expect(halves.late).toHaveLength(1);
  });
});

describe("courseBrief", () => {
  test("lists units in order with their card counts and drops empty ones", () => {
    const brief = courseBrief({
      course: { name: "Investments" },
      units: [unit("b", 2), unit("a", 1), unit("empty", 3), { id: "hubs", label: "_Hubs", aliases: [], order: 0 }],
      nodes: [{ id: "n1", slug: "n1", title: "N1", type: "note", tags: [], unitIds: ["a"], sources: [], updated: "", body: "" }],
      cards: [
        { id: "1", nodeId: "n1", front: "q", back: "a", type: "qa", unitIds: ["a"], tags: [] },
        { id: "2", nodeId: "n2", front: "q", back: "a", type: "qa", unitIds: ["b"], tags: [] },
        { id: "3", nodeId: "n3", front: "q", back: "a", type: "qa", unitIds: ["hubs"], tags: [] },
      ],
    });
    expect(brief).toEqual({ name: "Investments", units: [{ id: "a", label: "Unit a", cards: 1 }, { id: "b", label: "Unit b", cards: 1 }] });
  });
});
