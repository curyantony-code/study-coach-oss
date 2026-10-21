import { describe, expect, test } from "vitest";
import { buildExam, kindsFor, markExam, MINUTES_PER_QUESTION } from "@/lib/learner/exam";
import type { StateMap } from "@/lib/learner/mastery";
import { applyAnswer } from "@/lib/learner/schedule";
import type { Card } from "@/lib/vault/types";

const NOW = new Date(2026, 1, 1, 10);

function card(id: string, unit: string, type: Card["type"] = "definition"): Card {
  return { id, nodeId: `${unit}.md`, front: `Q ${id}`, back: `A ${id}`, type, unitIds: [unit], tags: [] };
}
const CARDS = [...Array.from({ length: 12 }, (_, i) => card(`a${i}`, "wk1")), ...Array.from({ length: 12 }, (_, i) => card(`b${i}`, "wk2"))];

/** A repeatable stand-in for Math.random. */
function seeded(seed = 7): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("kindsFor", () => {
  test.each([
    [["mcq"], ["choice"]],
    [["multiple-choice", "true/false"], ["choice"]],
    [["short-answer", "essay"], ["written"]],
    [["mcq", "short-answer", "essay"], ["choice", "written"]],
    [[], ["choice", "written"]],
    [["oral"], ["choice", "written"]],
  ])("%j → %j", (format, kinds) => {
    expect(kindsFor(format)).toEqual(kinds);
  });
});

describe("buildExam", () => {
  test("draws the requested number of distinct questions and times the paper", () => {
    const paper = buildExam(CARDS, new Map(), { format: ["mcq"], emphasis: [] }, { now: NOW, count: 10, random: seeded() });
    expect(paper.questions).toHaveLength(10);
    expect(new Set(paper.questions.map((q) => q.cardId)).size).toBe(10);
    expect(paper.questions.every((q) => q.kind === "choice" && q.options.length === 4)).toBe(true);
    expect(paper.minutes).toBe(10 * MINUTES_PER_QUESTION.choice);
  });

  test("every multiple-choice question includes its right answer exactly once", () => {
    const paper = buildExam(CARDS, new Map(), { format: ["mcq"], emphasis: [] }, { now: NOW, count: 24, random: seeded(3) });
    for (const q of paper.questions) {
      const answer = CARDS.find((c) => c.id === q.cardId)!.back;
      expect(q.options.filter((o) => o === answer)).toHaveLength(1);
      expect(new Set(q.options).size).toBe(4);
    }
  });

  test("mixes units instead of finishing one first", () => {
    const paper = buildExam(CARDS, new Map(), { format: ["mcq"], emphasis: [] }, { now: NOW, count: 16, random: seeded() });
    const firstHalf = new Set(paper.questions.slice(0, 8).map((q) => q.unitId));
    expect(firstHalf.size).toBe(2);
  });

  test("follows the assessment's format", () => {
    const written = buildExam(CARDS, new Map(), { format: ["short-answer"], emphasis: [] }, { now: NOW, count: 6, random: seeded() });
    expect(written.questions.every((q) => q.kind === "written" && q.options.length === 0)).toBe(true);
    expect(written.minutes).toBe(6 * MINUTES_PER_QUESTION.written);
    const mixed = buildExam(CARDS, new Map(), { format: ["mcq", "essay"], emphasis: [] }, { now: NOW, count: 10, random: seeded() });
    expect(new Set(mixed.questions.map((q) => q.kind))).toEqual(new Set(["choice", "written"]));
  });

  test("worked problems are always written, and too few options means written too", () => {
    const problems = [card("p1", "wk1", "problem"), card("p2", "wk1", "problem"), ...CARDS.slice(0, 6)];
    const paper = buildExam(problems, new Map(), { format: ["mcq"], emphasis: [] }, { now: NOW, count: 8, random: seeded() });
    expect(paper.questions.filter((q) => q.cardId.startsWith("p")).every((q) => q.kind === "written")).toBe(true);
    const tiny = buildExam(CARDS.slice(0, 3), new Map(), { format: ["mcq"], emphasis: [] }, { now: NOW, random: seeded() });
    expect(tiny.questions).toHaveLength(3);
    expect(tiny.questions.every((q) => q.kind === "written")).toBe(true);
  });

  test("favours emphasised units and weaker cards", () => {
    const share = (emphasis: string[], states: StateMap = new Map()) => {
      let fromWk2 = 0;
      for (let seed = 1; seed <= 60; seed++) {
        fromWk2 += buildExam(CARDS, states, { format: ["mcq"], emphasis }, { now: NOW, count: 8, random: seeded(seed) }).questions.filter((q) => q.unitId === "wk2").length;
      }
      return fromWk2 / (60 * 8);
    };
    expect(share(["wk2"])).toBeGreaterThan(share([]) + 0.08);

    const strongWk2: StateMap = new Map();
    for (const c of CARDS.filter((c) => c.unitIds[0] === "wk2")) {
      strongWk2.set(c.id, applyAnswer(null, { cardId: c.id, nodePath: c.nodeId }, { correct: true, confidence: "certain" }, NOW, null));
    }
    expect(share([], strongWk2)).toBeLessThan(share([]) - 0.08);
  });

  test("an empty scope gives an empty paper", () => {
    expect(buildExam([], new Map(), { format: [], emphasis: [] }, { now: NOW })).toEqual({ questions: [], minutes: 1 });
  });
});

describe("markExam", () => {
  const paper = buildExam(CARDS, new Map(), { format: ["mcq", "short-answer"], emphasis: [] }, { now: NOW, count: 6, random: seeded(11) });
  const answerOf = (id: string) => CARDS.find((c) => c.id === id)!.back;

  test("marks multiple choice automatically and written answers by the student's own mark", () => {
    const answers = paper.questions.map((q, i) => ({
      cardId: q.cardId,
      response: q.kind === "choice" ? (i === 0 ? "wrong option" : answerOf(q.cardId)) : "my written answer",
      selfMark: q.kind === "written" ? i % 3 !== 0 : null,
    }));
    const result = markExam(paper.questions, answers, CARDS);
    expect(result.total).toBe(6);
    expect(result.unmarked).toBe(0);
    const expected = paper.questions.filter((q, i) => (q.kind === "choice" ? i !== 0 : i % 3 !== 0)).length;
    expect(result.correct).toBe(expected);
    expect(result.byUnit.reduce((sum, u) => sum + u.total, 0)).toBe(6);
    expect(result.marked[0]).toMatchObject({ answer: answerOf(paper.questions[0].cardId), correct: false });
  });

  test("blank answers are wrong; written answers wait for a mark", () => {
    const blank = markExam(paper.questions, [], CARDS);
    expect(blank).toMatchObject({ correct: 0, unmarked: 0 });
    const pending = markExam(paper.questions, paper.questions.map((q) => ({ cardId: q.cardId, response: "text", selfMark: null })), CARDS);
    expect(pending.unmarked).toBe(paper.questions.filter((q) => q.kind === "written").length);
  });

  test("ignores questions whose card has left the vault", () => {
    expect(markExam(paper.questions, [], CARDS.slice(0, 1)).total).toBeLessThan(6);
  });
});
