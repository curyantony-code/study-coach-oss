import { beforeEach, describe, expect, test } from "vitest";
import { openDb, type Db } from "@/lib/db/client";
import {
  claimPaperRecording, getCardState, getCardStates, getCheckin, getOrCreateStudent, getPaper, savePaper, getProfileAnswers, insertAttempt, inTransaction, latestExplanations, saveExplanation,
  listAttempts, listAttemptTimes, renameStudent, saveCardState, saveCheckin, saveProfileAnswers,
} from "@/lib/db/progress";
import { legacyProgressSchema, legacyToStates } from "@/lib/learner/legacy";
import { applyAnswer } from "@/lib/learner/schedule";
import type { Attempt } from "@/lib/learner/types";
import { addVault, getVault, listVaults, removeVault, setWriteEnabled } from "@/lib/vault/registry";
import { indexFixture } from "./helpers";

const NOW = new Date(2026, 1, 1, 10);
const card = { cardId: "c1", nodePath: "a.md" };
const attempt = (overrides: Partial<Attempt> = {}): Attempt => ({
  cardId: "c1", nodePath: "a.md", scope: "unit:wk1", mode: "flashcards", correct: true,
  confidence: "certain", responseMs: 1200, createdAt: NOW.toISOString(), ...overrides,
});

describe("progress storage", () => {
  let db: Db;
  let studentId: number;
  beforeEach(() => {
    db = openDb(":memory:");
    studentId = getOrCreateStudent(db).id;
  });

  test("creates the single local student once", () => {
    expect(getOrCreateStudent(db)).toEqual({ id: studentId, name: "Me" });
    renameStudent(db, studentId, "Alex");
    expect(getOrCreateStudent(db).name).toBe("Alex");
  });

  test("saves and reloads a card state exactly", () => {
    const state = applyAnswer(null, card, { correct: false, confidence: "certain", guessedFirst: true }, NOW, null);
    saveCardState(db, studentId, "v1", state);
    expect(getCardState(db, studentId, "v1", "c1")).toEqual(state);
    expect(getCardStates(db, studentId, "v1").get("c1")).toEqual(state);
  });

  test("updates a card state in place", () => {
    const first = applyAnswer(null, card, { correct: false, confidence: "certain" }, NOW, null);
    saveCardState(db, studentId, "v1", first);
    const second = applyAnswer(first, card, { correct: true, confidence: "fairly-sure" }, new Date(2026, 1, 2), null);
    saveCardState(db, studentId, "v1", second);
    expect(getCardStates(db, studentId, "v1").size).toBe(1);
    expect(getCardState(db, studentId, "v1", "c1")).toMatchObject({ seen: 2, correct: 1, needsFix: false, confidentWrong: 1 });
  });

  test("keeps each vault's progress separate", () => {
    saveCardState(db, studentId, "v1", applyAnswer(null, card, { correct: true, confidence: null }, NOW, null));
    expect(getCardStates(db, studentId, "v2").size).toBe(0);
    expect(getCardState(db, studentId, "v2", "c1")).toBeNull();
  });

  test("logs attempts in order, per vault", () => {
    insertAttempt(db, studentId, "v1", attempt());
    insertAttempt(db, studentId, "v1", attempt({ correct: false, confidence: null, responseMs: null, mode: "quiz" }));
    insertAttempt(db, studentId, "v2", attempt({ cardId: "other" }));
    expect(listAttempts(db, studentId, "v1")).toEqual([attempt(), attempt({ correct: false, confidence: null, responseMs: null, mode: "quiz" })]);
    expect(listAttemptTimes(db, studentId)).toHaveLength(3);
  });

  test("a failed transaction saves nothing", () => {
    expect(() =>
      inTransaction(db, () => {
        insertAttempt(db, studentId, "v1", attempt());
        throw new Error("boom");
      })
    ).toThrow("boom");
    expect(listAttempts(db, studentId, "v1")).toEqual([]);
  });

  test("stores intake answers per vault", () => {
    expect(getProfileAnswers(db, studentId, "v1")).toBeNull();
    saveProfileAnswers(db, studentId, "v1", { sleep: "good" });
    saveProfileAnswers(db, studentId, "v1", { sleep: "some" });
    expect(getProfileAnswers(db, studentId, "v1")).toEqual({ sleep: "some" });
    expect(getProfileAnswers(db, studentId, "v2")).toBeNull();
  });

  test("keeps one sleep check-in per day, the latest answer winning", () => {
    expect(getCheckin(db, studentId, "2026-02-01")).toBeNull();
    saveCheckin(db, studentId, "2026-02-01", "good");
    saveCheckin(db, studentId, "2026-02-01", "poor");
    expect(getCheckin(db, studentId, "2026-02-01")).toBe("poor");
    expect(getCheckin(db, studentId, "2026-02-02")).toBeNull();
  });

  test("keeps teach-back attempts and returns the latest per note", () => {
    const base = { text: "my explanation", covered: ["a"], missing: ["b"], tip: "fix b", selfRated: false };
    saveExplanation(db, studentId, "v1", { ...base, nodePath: "n1.md", score: 40, createdAt: "2026-02-01T10:00:00.000Z" });
    saveExplanation(db, studentId, "v1", { ...base, nodePath: "n1.md", score: 75, createdAt: "2026-02-02T10:00:00.000Z" });
    saveExplanation(db, studentId, "v1", { ...base, nodePath: "n2.md", score: 55, covered: [], missing: [], tip: "", selfRated: true, createdAt: "2026-02-03T10:00:00.000Z" });
    saveExplanation(db, studentId, "v2", { ...base, nodePath: "n1.md", score: 10, createdAt: "2026-02-04T10:00:00.000Z" });
    const latest = latestExplanations(db, studentId, "v1");
    expect(latest.map((e) => [e.nodePath, e.score, e.selfRated])).toEqual([["n2.md", 55, true], ["n1.md", 75, false]]);
    expect(latest[1]).toMatchObject({ covered: ["a"], missing: ["b"], tip: "fix b", text: "my explanation" });
  });

  test("keeps an issued exam paper and lets it be recorded only once", () => {
    const paper = { id: "p1", scope: "assessment:mid", questions: [{ cardId: "c1", kind: "choice" }] };
    savePaper(db, studentId, "v1", paper, NOW);
    expect(getPaper(db, studentId, "v1", "p1")).toEqual({ ...paper, recordedAt: null });
    expect(getPaper(db, studentId, "v2", "p1")).toBeNull();
    expect(getPaper(db, studentId, "v1", "nope")).toBeNull();
    expect(claimPaperRecording(db, "p1", NOW)).toBe(true);
    expect(claimPaperRecording(db, "p1", NOW)).toBe(false);
    expect(getPaper(db, studentId, "v1", "p1")!.recordedAt).toBe(NOW.toISOString());
  });

  test("removing a vault keeps its progress, and adding it back restores it", () => {
    const vault = addVault(db, "/tmp/course");
    setWriteEnabled(db, vault.id, true);
    saveCardState(db, studentId, vault.id, applyAnswer(null, card, { correct: true, confidence: null }, NOW, null));
    removeVault(db, vault.id);
    expect(listVaults(db)).toEqual([]);
    expect(getVault(db, vault.id)).toBeNull();

    const restored = addVault(db, "/tmp/course");
    expect(restored.id).toBe(vault.id);
    expect(restored.writeEnabled).toBe(false);
    expect(getCardStates(db, studentId, restored.id).size).toBe(1);
  });
});

describe("importing the old app's browser progress", () => {
  const index = indexFixture("wiki-vault");
  const [a, b, c, d] = index.cards;

  test("turns known and answered cards into reviewed cards", () => {
    const legacy = legacyProgressSchema.parse({
      known: [a.id],
      progress: [
        { id: b.id, correct: 2, incorrect: 1, mastered: true, lastSeen: "2026-01-20T10:00:00.000Z" },
        { id: c.id, correct: 0, incorrect: 3, mastered: false, lastSeen: "" },
        { id: "gone", correct: 5, incorrect: 0, mastered: true, lastSeen: "" },
      ],
    });
    const states = legacyToStates(legacy, index.cards, new Map(), NOW);
    const byId = new Map(states.map((s) => [s.cardId, s]));
    expect([...byId.keys()].sort()).toEqual([a.id, b.id, c.id].sort());
    expect(byId.get(a.id)).toMatchObject({ seen: 1, correct: 1, nodePath: a.nodeId });
    expect(byId.get(b.id)).toMatchObject({ seen: 3, correct: 2, lastSeen: "2026-01-20T10:00:00.000Z" });
    expect(byId.get(c.id)).toMatchObject({ seen: 3, correct: 0 });
    // Answered right before: remembered for longer than a card only ever missed.
    expect(byId.get(b.id)!.fsrs!.stability).toBeGreaterThan(byId.get(c.id)!.fsrs!.stability);
  });

  test("never overwrites progress made in the new app, so it is safe to repeat", () => {
    const existing = new Map([[a.id, applyAnswer(null, { cardId: a.id, nodePath: a.nodeId }, { correct: true, confidence: "certain" }, NOW, null)]]);
    const states = legacyToStates(legacyProgressSchema.parse({ known: [a.id, d.id] }), index.cards, existing, NOW);
    expect(states.map((s) => s.cardId)).toEqual([d.id]);
  });

  test("ignores dates in the future and accepts missing fields", () => {
    const states = legacyToStates(legacyProgressSchema.parse({ progress: [{ id: a.id, correct: 1, lastSeen: "2999-01-01T00:00:00Z" }] }), index.cards, new Map(), NOW);
    expect(states[0].lastSeen).toBe(NOW.toISOString());
    expect(legacyProgressSchema.parse({})).toEqual({ known: [], progress: [] });
    expect(legacyProgressSchema.safeParse({ known: "all" }).success).toBe(false);
  });
});
