import { describe, expect, test } from "vitest";
import { openDb } from "@/lib/db/client";
import { getOrCreateStudent } from "@/lib/db/progress";
import { listQuizResults, saveQuizResult } from "@/lib/db/quiz";

describe("quiz results", () => {
  test("are kept per vault, newest first, up to the limit", () => {
    const db = openDb(":memory:");
    const student = getOrCreateStudent(db);
    const result = (takenAt: string, score: number) => ({ takenAt, topic: "Node 3 - CAPM", source: "ai" as const, score, total: 10 });
    saveQuizResult(db, student.id, "v1", result("2026-10-01T10:00:00.000Z", 6));
    saveQuizResult(db, student.id, "v1", result("2026-10-03T10:00:00.000Z", 9));
    saveQuizResult(db, student.id, "v1", result("2026-10-02T10:00:00.000Z", 7));
    saveQuizResult(db, student.id, "v2", result("2026-10-04T10:00:00.000Z", 1));

    expect(listQuizResults(db, student.id, "v1").map((r) => r.score)).toEqual([9, 7, 6]);
    expect(listQuizResults(db, student.id, "v1", 2)).toHaveLength(2);
    expect(listQuizResults(db, student.id, "v2")).toEqual([result("2026-10-04T10:00:00.000Z", 1)]);
  });
});
