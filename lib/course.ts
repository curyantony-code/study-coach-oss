// What the practice tools need to know about the vault being studied: what the course is
// called and how it is divided up. Nothing here is specific to one course.
import type { Unit, VaultIndex } from "./vault/types";

export interface UnitChoice {
  id: string;
  label: string;
  /** How many study cards the unit has. */
  cards: number;
}

export interface CourseBrief {
  name: string;
  units: UnitChoice[];
}

/** Folders such as "_Hubs" or "_templates" organise a vault; they are not topics to study. */
export function isHousekeeping(label: string): boolean {
  return label.startsWith("_") || label.startsWith(".");
}

/** The course name and its units in order, for topic pickers. Units with nothing in them are left out. */
export function courseBrief(index: Pick<VaultIndex, "course" | "units" | "nodes" | "cards">): CourseBrief {
  const units = [...index.units]
    .sort((a, b) => a.order - b.order)
    .map((unit) => ({ id: unit.id, label: unit.label, cards: index.cards.filter((c) => c.unitIds.includes(unit.id)).length }))
    .filter((unit) => unit.cards > 0 || index.nodes.some((n) => n.unitIds.includes(unit.id)))
    .filter((unit) => !isHousekeeping(unit.label));
  return { name: index.course.name, units };
}

/** The course name and unit labels in order, as the AI tutor's instructions want them. */
export function tutorCourse(index: Pick<VaultIndex, "course" | "units">): { name: string; units: string[] } {
  return { name: index.course.name, units: [...index.units].sort((a, b) => a.order - b.order).map((u) => u.label).filter((label) => !isHousekeeping(label)) };
}

export interface TopicChoice {
  /** The note's slug: what the quiz is asked for. */
  slug: string;
  label: string;
  /** The unit the note sits in, for grouping; "" when it has none. */
  unitLabel: string;
  cards: number;
  /** Worked examples in the note: new questions can be modelled on these. */
  examples: number;
}

/** "FIN 201 - Topic 05 - Capital Structure" → "Topic 05 - Capital Structure". */
function withoutCourseCode(title: string): string {
  return title.replace(/^[A-Z]{2,5}\s?\d{2,4}[A-Z]?\s*[-–—:]\s*/, "").trim() || title;
}

/**
 * Every note that can be quizzed on its own: one topic each, in the course's order.
 * Housekeeping folders (hubs, templates) and notes with nothing to ask about are left out.
 */
export function quizTopics(index: Pick<VaultIndex, "units" | "nodes" | "cards">): TopicChoice[] {
  const units = [...index.units].sort((a, b) => a.order - b.order);
  const position = new Map(units.map((u, i) => [u.id, i]));
  const labels = new Map(units.map((u) => [u.id, u.label]));
  return index.nodes
    .map((node) => {
      const own = index.cards.filter((c) => c.nodeId === node.id);
      const unitId = node.unitIds[0];
      return {
        slug: node.slug,
        label: withoutCourseCode(node.title),
        unitLabel: unitId ? labels.get(unitId) ?? "" : "",
        cards: own.length,
        examples: own.filter((c) => c.type === "problem").length,
        order: unitId ? position.get(unitId) ?? units.length : units.length,
      };
    })
    .filter((topic) => topic.cards > 0 && !isHousekeeping(topic.unitLabel))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, undefined, { numeric: true }))
    .map(({ slug, label, unitLabel, cards, examples }) => ({ slug, label, unitLabel, cards, examples }));
}

/** The share of a course's units counted as its "earlier" part. */
const EARLY_SHARE = 0.4;

export interface CourseHalves<T> {
  early: T[];
  late: T[];
  earlyLabel: string;
  lateLabel: string;
}

function rangeLabel(units: Unit[]): string {
  if (units.length === 0) return "";
  return units.length === 1 ? units[0].label : `${units[0].label} to ${units[units.length - 1].label}`;
}

/**
 * Splits a course's notes into an earlier and a later part, by the order of its units, so a
 * practice test can lean on recent material while still revisiting the start.
 * Notes that belong to no unit count as later. With too little structure to split by units,
 * the notes themselves are split in the order given.
 */
export function splitEarlyLate<T>(units: Unit[], items: T[], unitIdsOf: (item: T) => string[]): CourseHalves<T> {
  const ordered = [...units].sort((a, b) => a.order - b.order).filter((u) => items.some((item) => unitIdsOf(item).includes(u.id)));
  if (ordered.length >= 2) {
    const cut = Math.min(ordered.length - 1, Math.max(1, Math.round(ordered.length * EARLY_SHARE)));
    const earlyIds = new Set(ordered.slice(0, cut).map((u) => u.id));
    const isEarly = (item: T) => {
      const ids = unitIdsOf(item);
      return ids.length > 0 && ids.every((id) => earlyIds.has(id));
    };
    const early = items.filter(isEarly);
    const late = items.filter((item) => !isEarly(item));
    // Notes that each span many units can leave one side empty: fall through to splitting by order.
    if (early.length > 0 && late.length > 0) {
      return { early, late, earlyLabel: rangeLabel(ordered.slice(0, cut)), lateLabel: rangeLabel(ordered.slice(cut)) };
    }
  }
  const cut = Math.max(1, Math.round(items.length * EARLY_SHARE));
  if (items.length < 2) return { early: items, late: items, earlyLabel: "the course", lateLabel: "the course" };
  return { early: items.slice(0, cut), late: items.slice(cut), earlyLabel: "the earlier notes", lateLabel: "the later notes" };
}

/** True for a note kept in a housekeeping folder ("wiki/_Hubs/Formula Sheet.md"): a reference sheet, not a topic. */
export function isReferenceNote(notePath: string): boolean {
  return notePath.split("/").slice(0, -1).some(isHousekeeping);
}
