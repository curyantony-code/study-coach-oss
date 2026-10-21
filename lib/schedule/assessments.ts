// Turns the tests found in a course outline into assessments, so readiness, the countdown and
// "study for the next test" work without anyone typing dates into study.yml.
import type { Assessment, AssessmentType, Unit } from "../vault/types";
import { unitForEntry } from "./match";
import type { OutlineEntry } from "./outline";

export interface DatedSchedule {
  entries: OutlineEntry[];
  finalDate: string | null;
  finalAssumed: boolean;
  confirmed: boolean;
}

const MAX_LABEL = 60;

function testType(title: string): AssessmentType {
  if (/mid-?term/i.test(title)) return "midterm";
  if (/quiz/i.test(title)) return "quiz";
  return "test";
}

function testLabel(entry: OutlineEntry, type: AssessmentType, position: number, count: number): string {
  const named = entry.title.match(/\b(mid-?term(?:\s+(?:exam|test))?(?:\s+\d)?|quiz\s*\d*|test\s*\d+|exam\s*\d+)\b/i)?.[1].trim();
  const base = named ? named[0].toUpperCase() + named.slice(1).toLowerCase() : type === "midterm" ? "Midterm" : type === "quiz" ? "Quiz" : "Test";
  const numbered = count > 1 && !/\d/.test(base) ? `${base} ${position}` : base;
  return numbered.slice(0, MAX_LABEL);
}

const plainName = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** A unit named after the test itself ("Midterm", "Test 1"): some vaults file their notes that way. */
function unitNamedAfter(label: string, type: AssessmentType, units: Unit[]): string[] {
  const hit = units.find((u) => plainName(u.label) === plainName(label) || (type === "midterm" && /^mid-?term\b/i.test(u.label.trim())));
  return hit ? [hit.id] : [];
}

/**
 * The units a test covers: a unit named after it, else the units of the classes taught before
 * it. When the classes cannot be matched to units, the same share of the units as the share of
 * classes already taught, in the vault's order.
 */
function unitsCovered(label: string, type: AssessmentType, entries: OutlineEntry[], date: string, units: Unit[]): string[] {
  const named = unitNamedAfter(label, type, units);
  if (named.length > 0) return named;
  const classes = entries.filter((e) => e.kind === "class");
  const before = classes.filter((e) => e.date < date);
  const taught = new Set(before.flatMap((e) => unitForEntry(e, units) ?? []));
  if (taught.size > 0) return units.filter((u) => taught.has(u.id)).map((u) => u.id);
  if (classes.length === 0 || before.length === 0) return units.map((u) => u.id);
  const share = Math.max(1, Math.ceil((before.length / classes.length) * units.length));
  return [...units].sort((x, y) => x.order - y.order).slice(0, share).map((u) => u.id);
}

/** One assessment per test in the outline, plus the final. A date we guessed is said to be a guess. */
export function scheduleAssessments(schedule: DatedSchedule, units: Unit[]): Assessment[] {
  const everyUnit = units.map((u) => u.id);
  const tests = schedule.entries.filter((e) => e.kind === "test").sort((a, b) => a.date.localeCompare(b.date));
  const countOf = (type: AssessmentType) => tests.filter((t) => testType(t.title) === type).length;
  const seen = new Map<AssessmentType, number>();
  const onDate = new Map<string, number>();

  const fromTests = tests.map((entry): Assessment => {
    const type = testType(entry.title);
    const position = (seen.get(type) ?? 0) + 1;
    seen.set(type, position);
    const label = testLabel(entry, type, position, countOf(type));
    // Two tests on one day keep separate ids.
    const sameDay = (onDate.get(entry.date) ?? 0) + 1;
    onDate.set(entry.date, sameDay);
    return {
      id: sameDay === 1 ? `outline-${entry.date}` : `outline-${entry.date}-${sameDay}`,
      label,
      type,
      date: entry.date,
      format: [],
      covers: unitsCovered(label, type, schedule.entries, entry.date, units),
      cumulative: false,
      emphasis: [],
      practice: [],
    };
  });

  // A guessed final on the very day of a test is that test (a course that ends with a quiz, not an exam).
  const guessIsATest = schedule.finalAssumed && tests.some((t) => t.date === schedule.finalDate);
  const final: Assessment[] = schedule.finalDate && !guessIsATest
    ? [{
        id: "outline-final",
        label: schedule.finalAssumed ? "Final exam (date assumed)" : "Final exam",
        type: "final",
        date: schedule.finalDate,
        format: [],
        covers: everyUnit,
        cumulative: true,
        emphasis: [],
        practice: [],
      }]
    : [];
  return [...fromTests, ...final];
}

/**
 * The assessments to study for. Ones written in study.yml win; any of them without a date
 * takes the date of the matching test in the outline. A vault with none uses the outline's.
 */
export function withScheduleDates(declared: Assessment[], schedule: DatedSchedule | null, units: Unit[]): Assessment[] {
  if (!schedule) return declared;
  const fromOutline = scheduleAssessments(schedule, units);
  if (declared.length === 0) return fromOutline;
  const unused = [...fromOutline];
  return declared.map((assessment) => {
    if (assessment.date !== null) return assessment;
    const type = assessment.type ?? (/final/i.test(assessment.label) ? "final" : testType(assessment.label));
    const at = unused.findIndex((o) => o.type === type);
    if (at === -1) return assessment;
    const [match] = unused.splice(at, 1);
    return { ...assessment, date: match.date };
  });
}
