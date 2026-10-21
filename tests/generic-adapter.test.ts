import { describe, expect, test } from "vitest";
import { indexFixture } from "./helpers";

describe("generic Obsidian vault", () => {
  const index = indexFixture("generic-vault");
  const node = (id: string) => index.nodes.find((n) => n.id === id)!;
  const cardsOf = (id: string) => index.cards.filter((c) => c.nodeId === id).map((c) => [c.type, c.front, c.back]);

  test("is detected as generic and uses the folder name as the course", () => {
    expect(index.style).toBe("generic");
    expect(index.course).toEqual({ name: "generic-vault" });
  });

  test("reads every note except drafts and hidden folders", () => {
    expect(index.nodes.map((n) => n.id).sort()).toEqual([
      "Biology/Cells.md",
      "Biology/Photosynthesis.md",
      "Broken.md",
      "History/Rome.md",
      "Loose.md",
    ]);
  });

  test("takes units from tags and properties first, then from top-level folders", () => {
    expect(index.units.map((u) => [u.id, u.label])).toEqual([
      ["biology", "Biology"],
      ["ch3", "Chapter 3"],
      ["wk2", "Week 2"],
    ]);
    expect(node("Biology/Cells.md").unitIds).toEqual(["biology"]);
    expect(node("Biology/Photosynthesis.md").unitIds).toEqual(["ch3"]);
    expect(node("History/Rome.md").unitIds).toEqual(["wk2"]);
    expect(node("Loose.md").unitIds).toEqual([]);
  });

  test("uses the first heading as the title and collects inline tags", () => {
    expect(node("Biology/Photosynthesis.md")).toMatchObject({ title: "Photosynthesis", type: "note", tags: ["bio", "ch3"] });
    expect(node("Biology/Photosynthesis.md").slug).toBe("Biology/Photosynthesis");
  });

  test("extracts cards from every explicit pattern", () => {
    expect(cardsOf("Biology/Cells.md")).toEqual([
      ["callout", "What is the powerhouse of the cell?", "The mitochondrion.\nIt makes ATP."],
      ["qa", "What surrounds a cell?", "The cell membrane,\nwhich is a lipid bilayer."],
      ["qa", "What holds DNA?", "The nucleus."],
      ["definition", "Osmosis", "movement of water across a membrane"],
      ["qa", "Is a virus alive?", "Most biologists say no"],
      ["definition", "Ribosome", "the structure that builds proteins"],
      ["definition", "Golgi", "packages and ships proteins"],
      ["table-row", "Organelle: Lysosome", "Job: Breaks down waste"],
    ]);
  });

  test("falls back to headings only when a note has no other cards", () => {
    expect(cardsOf("Biology/Photosynthesis.md")).toEqual([
      ["heading", "Photosynthesis — Light reactions", "They happen in the thylakoid membrane and produce ATP and NADPH."],
    ]);
    expect(cardsOf("History/Rome.md")).toEqual([["definition", "Republic", "government by elected representatives"]]);
    expect(cardsOf("Loose.md")).toEqual([]);
  });

  test("resolves links by note name or path and skips file embeds", () => {
    expect(index.edges).toEqual([
      { from: "Biology/Cells.md", to: "Biology/Photosynthesis.md" },
      { from: "Biology/Cells.md", to: "History/Rome.md" },
    ]);
    expect(index.brokenLinks).toEqual([{ from: "Biology/Cells.md", target: "Nowhere" }]);
  });

  test("warns instead of guessing", () => {
    expect(index.warnings).toEqual([
      "1 note with unreadable properties: Broken.md",
      "2 notes not in any unit.",
      "1 link pointing to notes that do not exist.",
      "No study.yml, so there are no assessments (tests, midterms, finals) yet.",
    ]);
  });
});

test("re-reading a vault reports the same problems again", () => {
  expect(indexFixture("generic-vault").warnings).toEqual(indexFixture("generic-vault").warnings);
  expect(indexFixture("generic-vault").warnings[0]).toMatch(/unreadable properties: Broken\.md/);
});

describe("vault with nothing to group by", () => {
  test("says how to create units", () => {
    const index = indexFixture("generic-vault", "course: { name: Flat }\ncontent: { include: ['Loose.md'] }\n");
    expect(index.units).toEqual([]);
    expect(index.warnings).toContain("No units found. Group notes into folders, tag them (#ch1, #wk1), or add a study.yml.");
  });
});
