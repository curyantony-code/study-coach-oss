// The small model's part in tagging: it is asked only about what the rules in tags.ts could
// not decide, it answers in a fixed shape, and code checks every field before it is used.
import { route } from "../ai/pipeline";
import { cleanCourse, KINDS, unitFromInput, type Kind, type UnitTag } from "./tags";

const SAMPLE_CHARS = 1800;
const MAX_TITLE = 90;

/**
 * The kinds the model may choose. Not "outline": on real course files the small model called
 * most slide decks an outline, and a wrong outline costs a course its dates. Outlines are
 * recognised by the rules alone (the name, or the wording of the first pages).
 */
const MODEL_KINDS = KINDS.filter((kind) => kind !== "outline");

export interface ModelTags {
  kind: Kind | null;
  course: string | null;
  unit: UnitTag | null;
  title: string | null;
}

const SYSTEM = [
  "You label one file of university course material. Reply with JSON only, in exactly this shape:",
  '{"kind": "...", "course": "...", "unit": "...", "title": "..."}',
  `kind: one of ${MODEL_KINDS.join(", ")}.`,
  "  slides = lecture slides; notes = study notes or summaries;",
  "  textbook = a book or a book chapter; problems = exercises without answers; solutions = worked answers; exam = a past or practice exam.",
  'course: the course code such as "FIN 101", only if it is written in the file or its name, else null.',
  'unit: "Chapter 7", "Week 3" or "Lecture 5" only if the file says so, else null.',
  "title: the topic in at most eight words, taken from the file, with no course code and no chapter number.",
].join("\n");

/** Turns the model's reply into tags, dropping anything that is not backed by the file itself. */
export function checkModelTags(reply: string, name: string, sample: string, knownCourses: string[]): ModelTags | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const answer = parsed as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const evidence = `${name}\n${sample}`.toLowerCase();

  const kind = (MODEL_KINDS as readonly string[]).includes(text(answer.kind).toLowerCase()) ? (text(answer.kind).toLowerCase() as Kind) : null;
  // A course is only believed when the student already has it, or its number is in the file.
  const code = cleanCourse(text(answer.course));
  const course = code && (knownCourses.includes(code) || evidence.includes(code.split(" ")[1].toLowerCase())) ? code : null;
  const unitTag = unitFromInput(text(answer.unit));
  const unitNumber = unitTag?.key.match(/\d+$/)?.[0];
  const unit = unitTag && unitNumber && /^[a-z]+\d+$/.test(unitTag.key) && new RegExp(`(?<!\\d)0*${unitNumber}(?!\\d)`).test(evidence.slice(0, 600)) ? unitTag : null;
  const rawTitle = text(answer.title).replace(/\s+/g, " ");
  const title = rawTitle.length >= 3 && rawTitle.length <= MAX_TITLE && /[a-z]{3}/i.test(rawTitle) ? rawTitle : null;
  return kind || course || unit || title ? { kind, course, unit, title } : null;
}

/** Asks the small model about one file. Null when no model is available or its reply fails the checks. */
export async function askSmallModel(name: string, text: string, pages: number, knownCourses: string[]): Promise<ModelTags | null> {
  const sample = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").slice(0, SAMPLE_CHARS);
  const user = [
    `File name: ${name}`,
    pages > 0 ? `Pages: ${pages}` : "",
    knownCourses.length > 0 ? `Courses this student takes: ${knownCourses.join(", ")}` : "",
    "", "Start of the file:", sample || "(no readable text)",
  ].filter((line, at) => line || at >= 3).join("\n");
  // With a model on this computer the file's text stays here: a reply that fails the checks is
  // dropped, not retried in the cloud. Only a computer with no local model asks a free cloud one.
  const result = await route(SYSTEM, user, (reply) => checkModelTags(reply, name, sample, knownCourses), { localOnly: true });
  return result.ok ? result.value : null;
}
