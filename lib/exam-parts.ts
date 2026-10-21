// Which notes a midterm or a final covers, worked out from whatever the vault and the
// student's schedule say, in order of how trustworthy the source is.
import { splitEarlyLate } from "./course";
import { unitForEntry } from "./schedule/match";
import type { OutlineEntry } from "./schedule/outline";
import type { VaultIndex } from "./vault/types";

export type ExamPart = "midterm" | "final";

export interface PartCoverage {
  nodeIds: string[];
  /** Plain words for where the coverage came from, shown to the student. */
  basis: string;
}

type IndexView = Pick<VaultIndex, "units" | "nodes" | "assessments">;

function isHousekeeping(label: string): boolean {
  return label.startsWith("_") || label.startsWith(".");
}

/** Notes that hold course material, not hubs or maps of content. */
function contentNodes(index: IndexView) {
  const skip = new Set(index.units.filter((u) => isHousekeeping(u.label)).map((u) => u.id));
  return index.nodes.filter((n) => n.unitIds.length === 0 || !n.unitIds.every((id) => skip.has(id)));
}

/**
 * The final is taken as cumulative: everything. The midterm is, in order:
 * the midterm in study.yml; a unit called "Midterm"; the classes before the first test in the
 * student's schedule; and failing all of those, the first part of the course.
 */
export function coverageFor(part: ExamPart, index: IndexView, scheduleEntries: OutlineEntry[] | null): PartCoverage {
  const nodes = contentNodes(index);
  if (part === "final") return { nodeIds: nodes.map((n) => n.id), basis: "the whole course (finals are treated as cumulative)" };

  const inUnits = (unitIds: Set<string>) => nodes.filter((n) => n.unitIds.some((id) => unitIds.has(id))).map((n) => n.id);

  const declared = index.assessments.find((a) => a.type === "midterm" || /mid-?term/i.test(a.label));
  if (declared && declared.covers.length > 0) {
    const ids = inUnits(new Set(declared.covers));
    if (ids.length > 0) return { nodeIds: ids, basis: `the units listed for “${declared.label}” in study.yml` };
  }

  const named = index.units.filter((u) => /mid-?term/i.test(u.label));
  if (named.length > 0) {
    const ids = inUnits(new Set(named.map((u) => u.id)));
    if (ids.length > 0) return { nodeIds: ids, basis: `your “${named[0].label}” folder` };
  }

  const firstTest = scheduleEntries?.find((e) => e.kind === "test");
  if (scheduleEntries && firstTest) {
    const units = index.units.filter((u) => !isHousekeeping(u.label));
    const taught = new Set(scheduleEntries.filter((e) => e.kind === "class" && e.date < firstTest.date).flatMap((e) => unitForEntry(e, units) ?? []));
    const ids = inUnits(taught);
    if (ids.length > 0) return { nodeIds: ids, basis: `the classes before your first test (${firstTest.date}) in your schedule` };
  }

  const halves = splitEarlyLate(index.units.filter((u) => !isHousekeeping(u.label)), nodes, (n) => n.unitIds);
  return { nodeIds: halves.early.map((n) => n.id), basis: `the first part of the course (${halves.earlyLabel}); set up your schedule or study.yml to make this exact` };
}
