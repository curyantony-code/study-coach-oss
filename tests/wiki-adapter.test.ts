import { describe, expect, test } from "vitest";
import { hashStr } from "@/lib/vault/cards";
import { indexFixture } from "./helpers";

describe("wiki-schema vault", () => {
  const index = indexFixture("wiki-vault");
  const node = (id: string) => index.nodes.find((n) => n.id === id)!;
  const cardsOf = (id: string) => index.cards.filter((c) => c.nodeId === id);

  test("is detected from wiki/sources, concepts and entities folders", () => {
    expect(index.style).toBe("wiki-schema");
    expect(index.hasManifest).toBe(false);
  });

  test("only reads notes under wiki/, never raw/, app code or hidden folders", () => {
    expect(index.nodes.map((n) => n.id).sort()).toEqual([
      "wiki/concepts/core-framework.md",
      "wiki/entities/equity-theory.md",
      "wiki/index.md",
      "wiki/overview.md",
      "wiki/sources/practice-midterm1.md",
      "wiki/sources/wk1-intro.md",
      "wiki/sources/wk2-motivation.md",
    ]);
  });

  test("keeps the original slugs and page types", () => {
    expect(node("wiki/concepts/core-framework.md")).toMatchObject({ slug: "concepts/core-framework", type: "concept" });
    expect(node("wiki/index.md")).toMatchObject({ slug: "index", type: "note", title: "Index" });
  });

  test("infers the course from the overview page", () => {
    expect(index.course).toEqual({ name: "TEST 101" });
  });

  test("builds units from `sources` values and labels them from the lecture page", () => {
    expect(index.units.map((u) => [u.id, u.label])).toEqual([
      ["wk1", "Week 1 — Introduction"],
      ["wk2", "Week 2 — Motivation"],
    ]);
  });

  test("lets a node belong to several units and ignores non-unit sources", () => {
    expect(node("wiki/concepts/core-framework.md").unitIds).toEqual(["wk1", "wk2"]);
    expect(node("wiki/entities/equity-theory.md").unitIds).toEqual(["wk2"]);
    expect(node("wiki/sources/practice-midterm1.md").unitIds).toEqual([]);
  });

  test("extracts exam tips and highlights with the original card ids, skipping prompts under 5 characters", () => {
    const cards = cardsOf("wiki/sources/wk1-intro.md");
    expect(cards.map((c) => [c.type, c.front, c.back])).toEqual([
      ["exam-tip", "Human capital", "knowledge, skills and abilities people bring"],
      ["highlight", "Strategic planning", "aligning people practices with strategy"],
    ]);
    expect(cards[0].id).toBe(hashStr("Human capital" + "sources/wk1-intro"));
    expect(cards[0].unitIds).toEqual(["wk1"]);
  });

  test("takes misconceptions and definition tables from entity pages only", () => {
    expect(cardsOf("wiki/entities/equity-theory.md").map((c) => [c.type, c.front])).toEqual([
      ["misconception", "True or False: Equity means equal pay"],
      ["misconception", "Misconception: people ignore others | Fact: people compare themselves to referents"],
      ["table-row", "Component: Inputs"],
      ["table-row", "Component: Outcomes"],
    ]);
    expect(cardsOf("wiki/concepts/core-framework.md")).toEqual([]);
  });

  test("links nodes through wikilinks, including aliased ones", () => {
    expect(index.edges).toContainEqual({ from: "wiki/sources/wk1-intro.md", to: "wiki/concepts/core-framework.md" });
    expect(index.edges).toContainEqual({ from: "wiki/entities/equity-theory.md", to: "wiki/concepts/core-framework.md" });
    expect(index.edges).toContainEqual({ from: "wiki/index.md", to: "wiki/overview.md" });
  });

  test("reports links to nothing, but not links to notes outside the studied content", () => {
    expect(index.brokenLinks).toEqual([{ from: "wiki/sources/wk1-intro.md", target: "missing-page" }]);
  });

  test("warns about orphans, broken links and the missing manifest", () => {
    expect(index.warnings).toEqual([
      "2 notes not in any unit.",
      "1 link pointing to notes that do not exist.",
      "No study.yml, so there are no assessments (tests, midterms, finals) yet.",
    ]);
  });
});
