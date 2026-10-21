import { describe, expect, it } from "vitest";
import { isReferenceNote } from "@/lib/course";

describe("isReferenceNote", () => {
  it("tells a reference sheet in a housekeeping folder from a topic note", () => {
    expect(isReferenceNote("wiki/_Hubs/FIN 101 - Formula Sheet.md")).toBe(true);
    expect(isReferenceNote("_templates/note.md")).toBe(true);
    expect(isReferenceNote("wiki/Node 2/FIN 101 - Portfolio Selection.md")).toBe(false);
    // Only folders count: a note whose own name starts with "_" is still a note.
    expect(isReferenceNote("wiki/Node 2/_draft.md")).toBe(false);
  });
});
