import { Rating } from "ts-fsrs";
import { describe, expect, test } from "vitest";
import { calibration, modeResults, streak } from "@/lib/learner/insights";
import { assessmentCards, assessmentReadiness, masteryOf, nodeMasteries, recallAt, unitMasteries, type StateMap } from "@/lib/learner/mastery";
import { buildQueue, countQueue } from "@/lib/learner/queue";
import {
  applyAnswer, clampDueForExam, daysUntil, desiredRetention, isExamMode, retrievabilityAt, reviewCard, toRating,
} from "@/lib/learner/schedule";
import { defaultScope, parseScope, resolveScope, scopeToString, type Scope } from "@/lib/learner/scope";
import type { Attempt, Confidence, StudyMode } from "@/lib/learner/types";
import type { Card } from "@/lib/vault/types";
import { indexFixture } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 1, 1, 10, 0, 0); // 1 Feb 2026, 10:00 local
const later = (days: number) => new Date(NOW.getTime() + days * DAY);

const MANIFEST = `
course: { name: Managing Tests }
units:
  - { id: wk1, label: Week 1 }
  - { id: wk2, label: Week 2 }
assessments:
  - { id: midterm, label: Midterm, date: 2026-02-10, covers: [wk1], practice: [wiki/sources/practice-midterm1.md] }
  - { id: final, label: Final, date: 2026-04-20, covers: all, emphasis: [wk2] }
`;
const index = indexFixture("wiki-vault", MANIFEST);
const cardsIn = (unit: string) => index.cards.filter((c) => c.unitIds.includes(unit));

function answer(states: StateMap, card: Card, correct: boolean, confidence: Confidence | null, at: Date, examDate: string | null = null): void {
  states.set(card.id, applyAnswer(states.get(card.id) ?? null, { cardId: card.id, nodePath: card.nodeId }, { correct, confidence }, at, examDate));
}

describe("toRating", () => {
  test.each([
    [false, "certain", Rating.Again],
    [false, null, Rating.Again],
    [true, "guessing", Rating.Hard],
    [true, "fairly-sure", Rating.Good],
    [true, null, Rating.Good],
    [true, "certain", Rating.Easy],
  ] as const)("correct=%s confidence=%s → %s", (correct, confidence, rating) => {
    expect(toRating({ correct, confidence })).toBe(rating);
  });
});

describe("exam mode", () => {
  test("counts days to the end of the assessment day", () => {
    expect(daysUntil("2026-02-01", NOW)).toBe(0);
    expect(daysUntil("2026-02-10", NOW)).toBe(9);
    expect(daysUntil("2026-01-31", NOW)).toBe(-1);
    // Late evening still counts calendar days, including across a clock change.
    expect(daysUntil("2026-03-09", new Date(2026, 2, 7, 23, 30))).toBe(2);
    expect(daysUntil("2026-11-02", new Date(2026, 9, 31, 23, 30))).toBe(2);
  });

  test("is on from 14 days before until the assessment day, and off otherwise", () => {
    expect(isExamMode("2026-02-15", NOW)).toBe(true);
    expect(isExamMode("2026-02-01", NOW)).toBe(true);
    expect(isExamMode("2026-02-16", NOW)).toBe(false);
    expect(isExamMode("2026-01-31", NOW)).toBe(false);
    expect(isExamMode(null, NOW)).toBe(false);
  });

  test("raises the retention target from 90% to 95%", () => {
    expect(desiredRetention("2026-02-10", NOW)).toBe(0.95);
    expect(desiredRetention("2026-04-20", NOW)).toBe(0.9);
    expect(desiredRetention(null, NOW)).toBe(0.9);
  });

  test("schedules shorter intervals than normal", () => {
    const due = (examDate: string | null) => Date.parse(reviewCard(null, { correct: true, confidence: "certain" }, NOW, examDate).due);
    expect(due("2026-02-15")).toBeLessThan(due(null));
  });

  test("pulls a review that would land after the assessment into its final 3 days", () => {
    const clamped = clampDueForExam(later(30), NOW, "2026-02-10");
    expect(clamped).toEqual(new Date(2026, 1, 7));
  });

  test("leaves reviews that already land before the assessment alone", () => {
    expect(clampDueForExam(later(2), NOW, "2026-02-10")).toEqual(later(2));
    expect(clampDueForExam(later(30), NOW, null)).toEqual(later(30));
    expect(clampDueForExam(later(30), NOW, "2026-04-20")).toEqual(later(30));
  });

  test("inside the final 3 days, asks again tomorrow while there is a day left", () => {
    const twoDaysBefore = new Date(2026, 1, 8, 10);
    expect(clampDueForExam(later(30), twoDaysBefore, "2026-02-10")).toEqual(new Date(2026, 1, 9, 10));
    const examMorning = new Date(2026, 1, 10, 8);
    expect(clampDueForExam(later(30), examMorning, "2026-02-10")).toEqual(later(30));
  });
});

describe("applyAnswer", () => {
  const card = { cardId: "c1", nodePath: "a.md" };

  test("starts a new card and counts the answer", () => {
    const state = applyAnswer(null, card, { correct: true, confidence: "fairly-sure" }, NOW, null);
    expect(state).toMatchObject({ cardId: "c1", nodePath: "a.md", seen: 1, correct: 1, confidentWrong: 0, needsFix: false, lastSeen: NOW.toISOString() });
    expect(Date.parse(state.fsrs!.due)).toBeGreaterThan(NOW.getTime());
  });

  test("flags a confident miss until the next correct answer", () => {
    const missed = applyAnswer(null, card, { correct: false, confidence: "certain" }, NOW, null);
    expect(missed).toMatchObject({ confidentWrong: 1, needsFix: true, correct: 0 });
    const missedAgain = applyAnswer(missed, card, { correct: false, confidence: "guessing" }, later(1), null);
    expect(missedAgain).toMatchObject({ confidentWrong: 1, needsFix: true, seen: 2 });
    const fixed = applyAnswer(missedAgain, card, { correct: true, confidence: "guessing" }, later(2), null);
    expect(fixed).toMatchObject({ confidentWrong: 1, needsFix: false, correct: 1 });
  });

  test("an unsure miss is not a confident miss", () => {
    expect(applyAnswer(null, card, { correct: false, confidence: "guessing" }, NOW, null)).toMatchObject({ confidentWrong: 0, needsFix: false });
  });

  test("records guess-first only for a card's first attempt", () => {
    const first = applyAnswer(null, card, { correct: false, confidence: null, guessedFirst: true }, NOW, null);
    expect(first.guessedFirst).toBe(true);
    const fresh = applyAnswer(null, card, { correct: true, confidence: null }, NOW, null);
    expect(applyAnswer(fresh, card, { correct: true, confidence: null, guessedFirst: true }, later(1), null).guessedFirst).toBe(false);
  });

  test("certain-and-right is spaced further than guessing-and-right", () => {
    const due = (confidence: Confidence) => Date.parse(applyAnswer(null, card, { correct: true, confidence }, NOW, null).fsrs!.due);
    expect(due("certain")).toBeGreaterThan(due("guessing"));
  });
});

describe("retrievability and mastery", () => {
  test("unseen cards are 0 and recall fades over time", () => {
    expect(retrievabilityAt(null, NOW)).toBe(0);
    const fsrs = reviewCard(null, { correct: true, confidence: "fairly-sure" }, NOW, null);
    expect(retrievabilityAt(fsrs, NOW)).toBeCloseTo(1, 2);
    expect(retrievabilityAt(fsrs, later(30))).toBeLessThan(retrievabilityAt(fsrs, later(3)));
  });

  test("mastery is the mean over all cards, unseen ones included", () => {
    const states: StateMap = new Map();
    const [first, second] = index.cards;
    answer(states, first, true, "certain", NOW);
    expect(recallAt([first, second], states, NOW)).toBeCloseTo(0.5, 2);
    expect(masteryOf([first, second], states, NOW)).toBe(recallAt([first, second], states, later(7)));
    expect(masteryOf([], states, NOW)).toBe(0);
  });

  test("mastery looks a week ahead, so a card just missed does not count as mastered", () => {
    const [first, second] = index.cards;
    const missed: StateMap = new Map();
    answer(missed, first, false, "fairly-sure", NOW);
    const nailed: StateMap = new Map();
    answer(nailed, second, true, "certain", NOW);
    expect(recallAt([first], missed, NOW)).toBeCloseTo(1, 2);
    expect(masteryOf([first], missed, NOW)).toBeLessThan(0.7);
    expect(masteryOf([second], nailed, NOW)).toBeGreaterThan(0.7);
  });

  test("node mastery is null for notes without cards and tracks confident misses", () => {
    const states: StateMap = new Map();
    const card = index.cards.find((c) => c.nodeId === "wiki/entities/equity-theory.md")!;
    answer(states, card, false, "certain", NOW);
    const byId = new Map(nodeMasteries(index, states, NOW).map((n) => [n.nodeId, n]));
    expect(byId.get("wiki/overview.md")).toMatchObject({ cardCount: 0, mastery: null });
    expect(byId.get("wiki/entities/equity-theory.md")).toMatchObject({ cardCount: 4, seenCount: 1, confidentWrong: 1, lastStudied: NOW.toISOString() });
    expect(byId.get("wiki/sources/wk1-intro.md")).toMatchObject({ mastery: 0, lastStudied: null });
  });

  test("unit mastery is weighted by cards", () => {
    const states: StateMap = new Map();
    for (const card of cardsIn("wk1")) answer(states, card, true, "certain", NOW);
    const byId = new Map(unitMasteries(index, states, NOW).map((u) => [u.unitId, u]));
    expect(byId.get("wk1")).toMatchObject({ cardCount: 2, seenCount: 2 });
    expect(byId.get("wk1")!.mastery).toBeGreaterThan(0.7);
    expect(byId.get("wk2")).toMatchObject({ cardCount: 5, seenCount: 0, mastery: 0 });
  });
});

describe("assessment readiness", () => {
  const midterm = index.assessments[0];
  const final = index.assessments[1];

  test("an assessment's cards are its units' cards, each once", () => {
    expect(assessmentCards(index, midterm).map((c) => c.id).sort()).toEqual(cardsIn("wk1").map((c) => c.id).sort());
    expect(assessmentCards(index, final)).toHaveLength(index.cards.length);
  });

  test("is 0 before any study and names the weakest unit", () => {
    expect(assessmentReadiness(index, final, new Map(), NOW)).toMatchObject({ readiness: 0, cardCount: 7 });
  });

  test("projects recall forward to the assessment day", () => {
    const states: StateMap = new Map();
    for (const card of cardsIn("wk1")) answer(states, card, true, "fairly-sure", NOW);
    const soon = assessmentReadiness(index, midterm, states, NOW);
    expect(soon.projectedTo).toEqual(new Date(2026, 1, 10, 9));
    expect(soon.readiness).toBeGreaterThan(0.5);
    expect(soon.readiness).toBeLessThan(recallAt(cardsIn("wk1"), states, NOW));

    const overall = assessmentReadiness(index, final, states, NOW);
    expect(overall.weakestUnitId).toBe("wk2");
    expect(overall.readiness).toBeLessThan(soon.readiness);
  });

  test("uses today for an assessment that has passed", () => {
    expect(assessmentReadiness(index, midterm, new Map(), later(60)).projectedTo).toEqual(later(60));
  });
});

describe("scopes", () => {
  const ctx = { today: "2026-02-01", states: new Map() as StateMap, now: NOW };

  test.each([
    [{ kind: "course" }, "course"],
    [{ kind: "next" }, "next"],
    [{ kind: "weakest" }, "weakest"],
    [{ kind: "assessment", id: "midterm" }, "assessment:midterm"],
    [{ kind: "unit", id: "wk1" }, "unit:wk1"],
    [{ kind: "node", id: "wiki/a b.md", neighbours: false }, "node:wiki/a b.md"],
    [{ kind: "node", id: "wiki/a:b.md", neighbours: true }, "node+:wiki/a:b.md"],
  ] as [Scope, string][])("%j ↔ %s", (scope, text) => {
    expect(scopeToString(scope)).toBe(text);
    expect(parseScope(text)).toEqual(scope);
  });

  test("rejects unknown or empty scope strings", () => {
    for (const bad of [null, "", "unit:", "galaxy:1", "unit"]) expect(parseScope(bad)).toBeNull();
  });

  test("defaults to the next assessment when one is dated, else the course", () => {
    expect(defaultScope(index, "2026-02-01")).toEqual({ kind: "next" });
    expect(defaultScope(index, "2026-05-01")).toEqual({ kind: "course" });
  });

  test("next assessment and assessment scopes carry the assessment and its emphasis", () => {
    expect(resolveScope(index, { kind: "next" }, ctx)).toMatchObject({ label: "Midterm", assessment: { id: "midterm" } });
    const final = resolveScope(index, { kind: "assessment", id: "final" }, ctx)!;
    expect(final.emphasis).toEqual(["wk2"]);
    expect(final.cards).toHaveLength(7);
    expect(resolveScope(index, { kind: "next" }, { ...ctx, today: "2026-05-01" })).toBeNull();
  });

  test("unit and node scopes pick their cards", () => {
    expect(resolveScope(index, { kind: "unit", id: "wk2" }, ctx)).toMatchObject({ label: "Week 2", assessment: null });
    expect(resolveScope(index, { kind: "unit", id: "wk2" }, ctx)!.cards).toHaveLength(5);
    const node = resolveScope(index, { kind: "node", id: "wiki/sources/wk2-motivation.md", neighbours: false }, ctx)!;
    expect(node.cards.map((c) => c.front)).toEqual(["Process theories explain how motivation works"]);
  });

  test("node + linked notes adds one hop in both directions", () => {
    const withLinks = resolveScope(index, { kind: "node", id: "wiki/sources/wk2-motivation.md", neighbours: true }, ctx)!;
    expect(withLinks.label).toBe("Week 2 — Motivation + linked notes");
    expect(new Set(withLinks.cards.map((c) => c.nodeId))).toEqual(new Set(["wiki/sources/wk2-motivation.md", "wiki/entities/equity-theory.md"]));
  });

  test("weakest puts notes with confident misses first", () => {
    const states: StateMap = new Map();
    for (const card of index.cards) answer(states, card, true, "certain", NOW);
    const target = index.cards.find((c) => c.nodeId === "wiki/sources/wk2-motivation.md")!;
    answer(states, target, false, "certain", later(1));
    const weakest = resolveScope(index, { kind: "weakest" }, { ...ctx, states, now: later(1) })!;
    expect(weakest.cards[0].nodeId).toBe("wiki/entities/equity-theory.md");
    expect(weakest.cards.map((c) => c.id)).toContain(target.id);
  });

  test("weakest ignores notes that were never studied", () => {
    const states: StateMap = new Map();
    const studied = index.cards.find((c) => c.nodeId === "wiki/sources/wk1-intro.md")!;
    answer(states, studied, true, "guessing", NOW);
    const weakest = resolveScope(index, { kind: "weakest" }, { ...ctx, states })!;
    expect(new Set(weakest.cards.map((c) => c.nodeId))).toEqual(new Set(["wiki/sources/wk1-intro.md"]));
  });

  test("unknown ids resolve to null", () => {
    expect(resolveScope(index, { kind: "unit", id: "nope" }, ctx)).toBeNull();
    expect(resolveScope(index, { kind: "assessment", id: "nope" }, ctx)).toBeNull();
    expect(resolveScope(index, { kind: "node", id: "nope.md", neighbours: true }, ctx)).toBeNull();
  });
});

describe("buildQueue", () => {
  const cards = index.cards;

  test("with nothing studied, introduces new cards, mixing units", () => {
    const queue = buildQueue(cards, new Map(), { now: NOW, limit: 4 });
    expect(queue.map((q) => q.reason)).toEqual(["new", "new", "new", "new"]);
    expect(new Set(queue.slice(0, 2).map((q) => q.card.unitIds[0])).size).toBe(2);
  });

  test("starts new material with the emphasised units", () => {
    const queue = buildQueue(cards, new Map(), { now: NOW, limit: 5, emphasis: ["wk2"] });
    expect(queue.every((q) => q.card.unitIds.includes("wk2"))).toBe(true);
  });

  test("puts confident misses first, then due reviews, then new cards", () => {
    const states: StateMap = new Map();
    const [a, b, c] = cards;
    answer(states, a, true, "fairly-sure", NOW);
    answer(states, b, true, "guessing", NOW);
    answer(states, c, false, "certain", NOW);
    const queue = buildQueue(cards, states, { now: later(40), limit: 5 });
    expect(queue.map((q) => q.reason)).toEqual(["fix", "due", "due", "new", "new"]);
    expect(queue[0].card.id).toBe(c.id);
  });

  test("orders due reviews by how overdue they are", () => {
    const states: StateMap = new Map();
    answer(states, cards[0], true, "certain", NOW);
    answer(states, cards[1], true, "guessing", NOW);
    const due = buildQueue(cards, states, { now: later(60), limit: 2 });
    expect(due.map((q) => q.card.id)).toEqual([cards[1].id, cards[0].id]);
  });

  test("on a low-sleep day, reviews only", () => {
    const states: StateMap = new Map();
    answer(states, cards[0], true, "fairly-sure", NOW);
    const queue = buildQueue(cards, states, { now: later(40), reviewOnly: true });
    expect(queue.map((q) => q.reason)).toEqual(["due"]);
  });

  test("when everything is studied and nothing is due, offers the weakest as extra practice", () => {
    const states: StateMap = new Map();
    for (const card of cards) answer(states, card, true, "certain", NOW);
    answer(states, cards[3], true, "guessing", NOW);
    const queue = buildQueue(cards, states, { now: later(0.5), limit: 3 });
    expect(queue.map((q) => q.reason)).toEqual(["extra", "extra", "extra"]);
    expect(queue[0].retrievability).toBeLessThanOrEqual(queue[1].retrievability);
  });

  test("countQueue summarises the whole scope", () => {
    const states: StateMap = new Map();
    answer(states, cards[0], true, "fairly-sure", NOW);
    answer(states, cards[1], false, "certain", NOW);
    expect(countQueue(cards, states, later(40))).toEqual({ total: 7, fix: 1, due: 1, fresh: 5 });
    expect(countQueue(cards, new Map(), NOW)).toEqual({ total: 7, fix: 0, due: 0, fresh: 7 });
  });
});

describe("insights", () => {
  let clock = 0;
  const attempt = (cardId: string, mode: StudyMode, correct: boolean, confidence: Confidence | null = null): Attempt => ({
    cardId, nodePath: "n.md", scope: "course", mode, correct, confidence, responseMs: null,
    createdAt: new Date(NOW.getTime() + clock++ * 1000).toISOString(),
  });

  test("calibration shows how often each confidence level was right", () => {
    const rows = calibration([
      attempt("a", "quiz", true, "certain"), attempt("b", "quiz", false, "certain"),
      attempt("c", "quiz", true, "certain"), attempt("d", "quiz", true, "certain"),
      attempt("e", "quiz", false, "guessing"), attempt("f", "match", true),
    ]);
    expect(rows).toEqual([
      { confidence: "guessing", answers: 1, accuracy: 0 },
      { confidence: "fairly-sure", answers: 0, accuracy: null },
      { confidence: "certain", answers: 4, accuracy: 0.75 },
    ]);
  });

  test("credits later reviews to the mode a card was first studied in", () => {
    const results = modeResults([
      attempt("a", "flashcards", false), attempt("b", "flashcards", true), attempt("c", "quiz", true),
      attempt("a", "quiz", true), attempt("a", "quiz", true), attempt("b", "match", false),
      attempt("c", "flashcards", false), attempt("c", "flashcards", false),
    ]);
    expect(results).toEqual([{ mode: "flashcards", laterReviews: 3, accuracy: 2 / 3 }]);
  });

  test("streak counts consecutive days, allowing for today not studied yet", () => {
    expect(streak(["2026-02-01", "2026-01-31", "2026-01-30", "2026-01-28"], "2026-02-01")).toBe(3);
    expect(streak(["2026-01-31", "2026-01-30"], "2026-02-01")).toBe(2);
    expect(streak(["2026-01-29"], "2026-02-01")).toBe(0);
    expect(streak([], "2026-02-01")).toBe(0);
    expect(streak(["2026-03-01", "2026-02-28"], "2026-03-01")).toBe(2);
  });
});

import { adviceFor, profileSchema, type Profile } from "@/lib/learner/profile";
import { dateDetail, readinessLines, studyOptions } from "@/lib/learner/overview";
import { askKindFor, bestAskKind, parseSessionMode, pickDistractors, planKinds, sessionHref, shuffle } from "@/lib/learner/session";
import { hintFor, hintLevel } from "@/lib/learner/hints";

describe("intake advice", () => {
  const base: Profile = {
    prior: "some", methods: ["flashcards", "practice"], timing: "spread", length: "mid", stuck: "push",
    enjoys: [], phone: "away", sleep: "good", bestTime: "morning", selfConfidence: 3,
  };

  test("good habits get a plan and no flags", () => {
    const advice = adviceFor(base, 30);
    expect(advice.flags).toEqual([]);
    expect(advice).toMatchObject({ activeMethods: 2, sessionsPerWeek: 4 });
    expect(advice.plan).toContain("Do your hardest material in the morning.");
  });

  test("flags cramming, passive methods, phone, sleep and overconfidence, with reasons", () => {
    const advice = adviceFor({ ...base, timing: "cram", methods: ["highlight"], phone: "on", sleep: "allnight", selfConfidence: 5 }, null);
    expect(advice.flags).toHaveLength(5);
    expect(advice.activeMethods).toBe(0);
  });

  test("an assessment within a week switches to daily practice", () => {
    const advice = adviceFor(base, 5);
    expect(advice.sessionsPerWeek).toBe(6);
    expect(advice.plan.join(" ")).toMatch(/daily mixed practice/);
  });

  test("preferences change suggested modes, never a label", () => {
    const advice = adviceFor({ ...base, enjoys: ["games", "aloud", "sketch"], length: "xl", prior: "new", bestTime: "varies" }, 30);
    expect(advice.plan.join(" ")).toMatch(/Match, Arcade, Write/);
    expect(advice.plan.join(" ")).not.toMatch(/learner|style/i);
  });

  test("the form's answers are validated", () => {
    expect(profileSchema.safeParse({ ...base, selfConfidence: "4" }).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, sleep: "insomnia" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, selfConfidence: 9 }).success).toBe(false);
  });
});

describe("session rules", () => {
  const card = (reason: "new" | "fix" | "due" | "extra", isProblem = false) => ({ reason, isProblem });

  test("flashcards always recall, quiz always choice, smart depends on the card", () => {
    expect(askKindFor("flashcards", card("new"), true)).toBe("recall");
    expect(askKindFor("quiz", card("due"), true)).toBe("choice");
    expect(askKindFor("smart", card("new"), true)).toBe("guess");
    expect(askKindFor("smart", card("fix"), true)).toBe("choice");
    expect(askKindFor("smart", card("due"), true)).toBe("recall");
    expect(askKindFor("smart", card("extra"), true)).toBe("recall");
  });

  test("falls back to recall when there are too few wrong options", () => {
    expect(askKindFor("quiz", card("new"), false)).toBe("recall");
    expect(askKindFor("smart", card("fix"), false)).toBe("recall");
  });

  test("a worked problem is always solved from memory", () => {
    expect(askKindFor("quiz", card("due", true), true)).toBe("recall");
    expect(askKindFor("smart", card("new", true), true)).toBe("recall");
  });

  test("the smart session moves up to 30% of cards toward the student's best mode", () => {
    const items = Array.from({ length: 10 }, () => card("due"));
    const planned = planKinds(items, "smart", true, "choice");
    expect(planned.filter((k) => k === "choice")).toHaveLength(3);
    expect(planned.filter((k) => k === "recall")).toHaveLength(7);
    // Spread through the session, not bunched at the start.
    expect(planned.slice(0, 3)).not.toEqual(["choice", "choice", "choice"]);
  });

  test("best mode never replaces guess-first, problems, or other session modes", () => {
    const items = [card("new"), card("new"), card("due", true), card("due"), card("fix")];
    expect(planKinds(items, "smart", true, "recall")).toEqual(["guess", "guess", "recall", "recall", "recall"]);
    expect(planKinds(items, "smart", true, "choice")).toEqual(["guess", "guess", "recall", "choice", "choice"]);
    expect(planKinds(items, "quiz", true, "recall")).toEqual(["choice", "choice", "recall", "choice", "choice"]);
    expect(planKinds(items, "smart", false, "choice")).toEqual(["guess", "guess", "recall", "recall", "recall"]);
    expect(planKinds(items, "smart", true, null)).toEqual(["guess", "guess", "recall", "recall", "choice"]);
  });

  test("best mode comes from the best-performing recall or choice mode", () => {
    expect(bestAskKind([{ mode: "match", accuracy: 0.9 }, { mode: "quiz", accuracy: 0.8 }, { mode: "flashcards", accuracy: 0.7 }])).toBe("choice");
    expect(bestAskKind([{ mode: "smart-recall", accuracy: 0.9 }])).toBe("recall");
    expect(bestAskKind([{ mode: "arcade", accuracy: 1 }])).toBeNull();
    expect(bestAskKind([])).toBeNull();
  });

  test("distractors are distinct and never the right answer", () => {
    const picked = pickDistractors("right", ["right", "a", "a", "b", "c", "d"], () => 0.3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    expect(picked).not.toContain("right");
    expect(pickDistractors("right", ["right", "a"])).toEqual(["a"]);
  });

  test("shuffle keeps every item and leaves the input alone", () => {
    const input = [1, 2, 3, 4];
    expect(shuffle(input, () => 0.5).sort()).toEqual([1, 2, 3, 4]);
    expect(input).toEqual([1, 2, 3, 4]);
  });

  test("session links carry scope, mode and size", () => {
    expect(sessionHref("node+:wiki/a b.md", "quiz", 20)).toBe("/study/session?scope=node%2B%3Awiki%2Fa+b.md&mode=quiz&size=20");
    expect(parseSessionMode("quiz")).toBe("quiz");
    expect(parseSessionMode("nonsense")).toBe("smart");
    expect(parseSessionMode(undefined)).toBe("smart");
  });
});

describe("study overview", () => {
  const input = (states: StateMap, now = NOW) => ({ index, states, now, today: "2026-02-01" });

  test("recommends the next assessment and lists every scope", () => {
    const options = studyOptions(input(new Map()));
    expect(options.recommended).toMatchObject({ scope: "next", label: "Midterm", detail: "In 9 days · 2026-02-10", mastery: 0 });
    expect(options.recommended.counts).toEqual({ total: 2, fix: 0, due: 0, fresh: 2 });
    expect(options.assessments.map((o) => o.scope)).toEqual(["assessment:midterm", "assessment:final"]);
    expect(options.units.map((o) => [o.scope, o.counts.total])).toEqual([["unit:wk1", 2], ["unit:wk2", 5]]);
    expect(options.course.counts.total).toBe(7);
    expect(options.weakest).toBeNull();
  });

  test("offers Weakest once there is some progress", () => {
    const states: StateMap = new Map();
    answer(states, index.cards[0], false, "certain", NOW);
    expect(studyOptions(input(states)).weakest).toMatchObject({ scope: "weakest", label: "Weakest notes" });
  });

  test("describes assessment dates in plain words", () => {
    expect(dateDetail(null, NOW)).toBe("No date set");
    expect(dateDetail("2026-02-01", NOW)).toBe("Today");
    expect(dateDetail("2026-02-02", NOW)).toBe("In 1 day · 2026-02-02");
    expect(dateDetail("2026-01-20", NOW)).toBe("Was on 2026-01-20");
  });

  test("writes one readiness sentence per assessment", () => {
    const states: StateMap = new Map();
    for (const card of cardsIn("wk1")) answer(states, card, true, "certain", NOW);
    const [midterm, final] = readinessLines(input(states));
    expect(midterm.sentence).toMatch(/^Midterm in 9 days: \d+% ready\. Weakest: Week 1\.$/);
    expect(final.sentence).toMatch(/^Final in 78 days: \d+% ready\. Weakest: Week 2\.$/);
    expect(midterm.readiness).toBeGreaterThan(final.readiness);
  });
});

describe("hint fading", () => {
  test("weak notes get the hint, middling ones can ask for it, strong ones get none", () => {
    expect(hintLevel(null)).toBe("full");
    expect(hintLevel(0)).toBe("full");
    expect(hintLevel(0.39)).toBe("full");
    expect(hintLevel(0.4)).toBe("light");
    expect(hintLevel(0.7)).toBe("light");
    expect(hintLevel(0.71)).toBe("none");
  });

  test("a worked problem's hint is its required formula", () => {
    expect(hintFor({ back: "42", problem: { heading: "h", formula: "$E=mc^2$", note: null } })).toBe("Formula: $E=mc^2$");
  });

  test("other cards get the opening words and the length, never the whole answer", () => {
    expect(hintFor({ back: "the knowledge, skills and abilities that people bring to work" })).toBe("Starts: “the knowledge, skills…” (10 words)");
    expect(hintFor({ back: "knowledge, skills and abilities people bring" })).toBeNull();
    expect(hintFor({ back: "Recruit people" })).toBeNull();
    expect(hintFor({ back: "$x^2$ is the area" })).toBe("The answer starts with a formula.");
    expect(hintFor({ back: "" })).toBeNull();
  });
});
