import { z } from "zod";

const list = <T extends [string, ...string[]]>(values: T) => z.array(z.enum(values)).default([]);

/** Intake answers (docs/ARCHITECTURE.md). Habits and preferences only: never health or "learning style" labels. */
export const profileSchema = z.object({
  prior: z.enum(["new", "some", "strong"]),
  methods: list(["reread", "highlight", "summarize", "flashcards", "practice", "teach", "draw"]),
  timing: z.enum(["cram", "week", "spread"]),
  length: z.enum(["short", "mid", "long", "xl"]),
  stuck: z.enum(["answer", "reread", "ask", "push"]),
  enjoys: list(["sketch", "cards", "aloud", "hand", "move", "games", "examples"]),
  phone: z.enum(["away", "silent", "on"]),
  sleep: z.enum(["good", "some", "allnight"]),
  bestTime: z.enum(["morning", "afternoon", "evening", "varies"]),
  selfConfidence: z.coerce.number().int().min(1).max(5),
});

export type Profile = z.infer<typeof profileSchema>;

const PASSIVE_METHODS = ["reread", "highlight", "summarize"] as const;
const ACTIVE_METHODS = ["flashcards", "practice", "teach", "draw"] as const;
const SESSIONS_PER_WEEK = { normal: 4, examSoon: 6 };
const EXAM_SOON_DAYS = 7;

export interface Advice {
  plan: string[];
  /** Habits worth changing, each with the reason. */
  flags: string[];
  activeMethods: number;
  sessionsPerWeek: number;
}

/** Turns intake answers into a plan. Preferences only change which modes are suggested. */
export function adviceFor(profile: Profile, daysToNextAssessment: number | null): Advice {
  const examSoon = daysToNextAssessment !== null && daysToNextAssessment <= EXAM_SOON_DAYS;
  const sessionsPerWeek = examSoon ? SESSIONS_PER_WEEK.examSoon : SESSIONS_PER_WEEK.normal;
  const plan = ["Short self-quizzes every session, spaced across the days until your next assessment."];

  if (examSoon) plan.push("Your assessment is close: daily mixed practice on your weakest notes.");
  else plan.push(`${sessionsPerWeek} short sessions a week, mixing older units with new ones.`);
  if (profile.length === "long" || profile.length === "xl") plan.push("Sessions capped at about 30 minutes, then a short break.");
  if (profile.prior === "new") plan.push("New material starts with easier recognition questions, then moves to recall from memory.");

  const modes = ["Smart session", "Confidence quiz"];
  if (profile.enjoys.includes("games") || profile.enjoys.includes("cards")) modes.push("Match", "Arcade");
  if (profile.enjoys.includes("aloud") || profile.enjoys.includes("hand")) modes.push("Write");
  plan.push(`Good modes for you: ${[...new Set(modes)].join(", ")}.`);
  if (profile.enjoys.includes("sketch")) plan.push("Off-screen: sketch each concept from memory before checking your notes.");
  if (profile.enjoys.includes("aloud")) plan.push("Say answers out loud before you reveal them.");
  plan.push(
    profile.bestTime === "varies"
      ? "Try your hardest material at different times of day and keep the slot where you score best."
      : `Do your hardest material in the ${profile.bestTime}.`
  );

  const flags: string[] = [];
  if (profile.timing === "cram") flags.push("Cramming fades fast. Reviews will be spread out instead.");
  if (profile.methods.some((m) => (PASSIVE_METHODS as readonly string[]).includes(m))) {
    flags.push("Rereading, highlighting and summarising feel productive but barely help. Self-testing replaces them here.");
  }
  if (profile.phone === "on") flags.push("Notifications cut what you remember. Put your phone in another room during sessions.");
  if (profile.sleep !== "good") flags.push("Short sleep makes new learning harder. After a short night, review instead of starting new material.");
  if (profile.selfConfidence >= 4) flags.push("High confidence is common before a first quiz. The Progress page shows how accurate it is.");

  return {
    plan,
    flags,
    activeMethods: profile.methods.filter((m) => (ACTIVE_METHODS as readonly string[]).includes(m)).length,
    sessionsPerWeek,
  };
}
