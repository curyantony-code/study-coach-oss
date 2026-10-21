import { describe, expect, test } from "vitest";
import { draftManifest } from "@/lib/vault/draft";
import { parseManifest } from "@/lib/vault/manifest";
import { indexFixture } from "./helpers";

const WIKI_MANIFEST = `
course: { code: TEST 101, name: Managing Tests, term: Winter 2026 }
content:
  include: [wiki/**]
  exclude: [wiki/index.md]
units:
  - { id: wk1, label: "Week 1 — Intro", aliases: [ch1] }
  - { id: wk2, label: "Week 2 — Motivation", aliases: [ch5] }
assessments:
  - id: midterm
    label: Midterm
    type: midterm
    date: 2026-02-20
    weight: 20
    format: [mcq, short-answer]
    covers: [ch1]
    practice: [wiki/sources/practice-midterm1.md]
  - id: final
    label: Final exam
    weight: 40
    covers: all
    emphasis: [wk2]
`;

describe("parseManifest", () => {
  test("accepts a full manifest and fills defaults", () => {
    const result = parseManifest(WIKI_MANIFEST);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.assessments[0].date).toBe("2026-02-20");
    expect(result.manifest.assessments[1]).toMatchObject({ covers: "all", format: [], practice: [] });
  });

  test("needs only a course name", () => {
    const result = parseManifest("course: { name: Tiny }");
    expect(result).toMatchObject({ ok: true, manifest: { units: [], assessments: [] } });
  });

  test.each([
    ["broken YAML", "course: [", /Not valid YAML/],
    ["missing course", "units: []", /course/],
    ["bad date", "course: { name: X }\nassessments: [{ id: a, label: A, date: tomorrow }]", /YYYY-MM-DD/],
    ["duplicate unit id", "course: { name: X }\nunits: [{ id: u1, label: A }, { id: u1, label: B }]", /"u1" is used more than once/],
    ["alias clashing with an id", "course: { name: X }\nunits: [{ id: u1, label: A }, { id: u2, label: B, aliases: [u1] }]", /"u1" is used more than once/],
    ["duplicate assessment id", "course: { name: X }\nassessments: [{ id: a, label: A }, { id: a, label: B }]", /id "a" is used more than once/],
    ["unknown unit in covers", "course: { name: X }\nunits: [{ id: u1, label: A }]\nassessments: [{ id: a, label: A, covers: [u9] }]", /unknown unit "u9"/],
  ])("rejects %s with a readable message", (_name, text, message) => {
    const result = parseManifest(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toMatch(message);
  });
});

describe("vault with a study.yml", () => {
  const index = indexFixture("wiki-vault", WIKI_MANIFEST);

  test("takes course and units from the manifest", () => {
    expect(index.hasManifest).toBe(true);
    expect(index.course).toEqual({ code: "TEST 101", name: "Managing Tests", term: "Winter 2026" });
    expect(index.units.map((u) => u.label)).toEqual(["Week 1 — Intro", "Week 2 — Motivation"]);
  });

  test("applies include and exclude globs", () => {
    expect(index.nodes.map((n) => n.id)).not.toContain("wiki/index.md");
    expect(index.nodes).toHaveLength(6);
  });

  test("resolves aliases in assessments and expands `covers: all`", () => {
    expect(index.assessments).toEqual([
      {
        id: "midterm", label: "Midterm", type: "midterm", date: "2026-02-20", weight: 20,
        format: ["mcq", "short-answer"], covers: ["wk1"], cumulative: false, emphasis: [],
        practice: ["wiki/sources/practice-midterm1.md"],
      },
      {
        id: "final", label: "Final exam", type: undefined, date: null, weight: 40,
        format: [], covers: ["wk1", "wk2"], cumulative: true, emphasis: ["wk2"], practice: [],
      },
    ]);
  });

  test("flags assessments without a date", () => {
    expect(index.warnings).toContain('Assessment "Final exam" has no date.');
    expect(index.warnings).not.toContain("No study.yml, so there are no assessments (tests, midterms, finals) yet.");
  });

  test("keeps card ids identical to the manifest-free index", () => {
    const withoutManifest = indexFixture("wiki-vault", null);
    const ids = (cards: { id: string }[]) => cards.map((c) => c.id).sort();
    expect(ids(index.cards)).toEqual(ids(withoutManifest.cards));
  });

  test("maps chapter-tagged notes onto week units through aliases", () => {
    const manifest = "course: { name: G }\nunits:\n  - { id: wk9, label: Plants, aliases: [ch3] }\n  - { id: bio, label: Biology }\n  - { id: hist, label: History }\n";
    const generic = indexFixture("generic-vault", manifest);
    const unitsOf = (id: string) => generic.nodes.find((n) => n.id === id)!.unitIds;
    expect(unitsOf("Biology/Photosynthesis.md")).toEqual(["bio", "wk9"]);
    expect(unitsOf("Biology/Cells.md")).toEqual(["bio"]);
    // `week: 2` names no known unit, so the History folder decides.
    expect(unitsOf("History/Rome.md")).toEqual(["hist"]);
  });

  test("limits card rules to the ones listed, and warns about unknown ones", () => {
    const manifest = "course: { name: G }\ncards: { sources: [qa, flashcards-plugin] }\n";
    const generic = indexFixture("generic-vault", manifest);
    expect(new Set(generic.cards.map((c) => c.type))).toEqual(new Set(["qa"]));
    expect(generic.warnings.join("\n")).toMatch(/unknown card source "flashcards-plugin"/);
  });
});

test("a study.yml without assessments says so", () => {
  const index = indexFixture("generic-vault", "course: { name: G }");
  expect(index.warnings).toContain("study.yml lists no assessments (tests, midterms, finals) yet.");
});

describe("invalid study.yml", () => {
  test("is ignored with a warning, and the vault is still readable", () => {
    const index = indexFixture("wiki-vault", "course: [");
    expect(index.hasManifest).toBe(false);
    expect(index.units).toHaveLength(2);
    expect(index.warnings[0]).toMatch(/^study\.yml was ignored because of an error — Not valid YAML/);
  });
});

describe("draftManifest", () => {
  test.each(["wiki-vault", "generic-vault"])("drafts a manifest for %s that parses and changes nothing", (name) => {
    const before = indexFixture(name, null);
    const draft = draftManifest(before);
    expect(parseManifest(draft).ok).toBe(true);
    const after = indexFixture(name, draft);
    expect(after.units.map((u) => [u.id, u.label])).toEqual(before.units.map((u) => [u.id, u.label]));
    expect(after.nodes.map((n) => [n.id, n.unitIds])).toEqual(before.nodes.map((n) => [n.id, n.unitIds]));
    expect(after.cards.map((c) => c.id)).toEqual(before.cards.map((c) => c.id));
  });
});
