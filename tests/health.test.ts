import { describe, expect, test } from "vitest";
import { localToday, nextAssessment, vaultHealth } from "@/lib/vault/health";
import type { Assessment } from "@/lib/vault/types";
import { indexFixture } from "./helpers";

function assessment(id: string, date: string | null): Assessment {
  return { id, label: id, date, format: [], covers: [], cumulative: false, emphasis: [], practice: [] };
}

describe("vaultHealth", () => {
  const health = vaultHealth(indexFixture("wiki-vault"));

  test("counts notes and cards per unit, counting shared notes in each unit", () => {
    expect(health.units.map((u) => [u.unit.id, u.nodeCount, u.cardCount])).toEqual([
      ["wk1", 3, 2],
      ["wk2", 3, 5],
    ]);
  });

  test("lists notes outside every unit and notes without cards", () => {
    expect(health.orphans.map((n) => n.id)).toEqual(["wiki/index.md", "wiki/sources/practice-midterm1.md"]);
    expect(health.nodesWithoutCards.map((n) => n.slug)).toEqual(["concepts/core-framework", "index", "overview", "sources/practice-midterm1"]);
  });
});

describe("nextAssessment", () => {
  const list = [assessment("final", "2026-04-25"), assessment("undated", null), assessment("midterm", "2026-02-20")];

  test("picks the soonest upcoming one and counts the days", () => {
    expect(nextAssessment(list, "2026-02-11")).toMatchObject({ assessment: { id: "midterm" }, daysAway: 9 });
  });

  test("counts an assessment happening today as 0 days away", () => {
    expect(nextAssessment(list, "2026-02-20")).toMatchObject({ assessment: { id: "midterm" }, daysAway: 0 });
  });

  test("skips past and undated assessments", () => {
    expect(nextAssessment(list, "2026-03-01")).toMatchObject({ assessment: { id: "final" }, daysAway: 55 });
    expect(nextAssessment(list, "2026-05-01")).toBeNull();
  });
});

test("localToday formats the local date", () => {
  expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
});
