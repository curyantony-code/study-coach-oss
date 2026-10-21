// How a vault is split into units ("segments"), put in a form the student can check at a
// glance before studying from it: each unit with what is in it, what was left out, and
// anything that looks off.
import { getDb } from "../db/client";
import { getSetting, setSetting } from "./registry";
import type { VaultIndex } from "./types";

const SAMPLE_TITLES = 4;
const NOT_A_TOPIC = /^(_.*|wiki|raw|notes?|misc|other|untitled|inbox|hubs?|attachments?)$/i;
const AN_EXAM = /^(mid-?term|final|quiz|test)\b/i;

export interface Segment {
  id: string;
  label: string;
  notes: number;
  cards: number;
  /** A few note titles, so the student can see what landed here. */
  sample: string[];
}

export interface SegmentReview {
  /** Where the split came from, in plain words. */
  basis: string;
  segments: Segment[];
  /** Notes that belong to no unit. */
  unplaced: { count: number; sample: string[] };
  /** Things that look wrong, most important first. */
  concerns: string[];
  totals: { notes: number; cards: number };
}

type IndexView = Pick<VaultIndex, "units" | "nodes" | "cards" | "hasManifest" | "style">;

export function reviewSegments(index: IndexView): SegmentReview {
  const cardsByNote = new Map<string, number>();
  for (const card of index.cards) cardsByNote.set(card.nodeId, (cardsByNote.get(card.nodeId) ?? 0) + 1);

  const segments = [...index.units].sort((a, b) => a.order - b.order).map((unit): Segment => {
    const notes = index.nodes.filter((node) => node.unitIds.includes(unit.id));
    return {
      id: unit.id,
      label: unit.label,
      notes: notes.length,
      cards: notes.reduce((sum, node) => sum + (cardsByNote.get(node.id) ?? 0), 0),
      sample: notes.slice(0, SAMPLE_TITLES).map((node) => node.title),
    };
  });
  const loose = index.nodes.filter((node) => node.unitIds.length === 0);

  const concerns: string[] = [];
  const list = (items: Segment[]) => items.map((s) => `“${s.label}”`).join(", ");
  if (segments.length === 0) concerns.push("No units were found, so everything would be studied as one block.");
  if (segments.length === 1 && index.nodes.length > 8) concerns.push("Everything landed in a single unit.");
  const byExam = segments.filter((s) => AN_EXAM.test(s.label.trim()));
  if (byExam.length > 0 && byExam.length >= segments.length / 2) concerns.push(`The notes are split by exam (${list(byExam)}), not by topic or week. You can still study, but progress cannot be shown per topic.`);
  const notTopics = segments.filter((s) => NOT_A_TOPIC.test(s.label.trim()));
  if (notTopics.length > 0) concerns.push(`${list(notTopics)} ${notTopics.length === 1 ? "is a folder name, not a topic" : "are folder names, not topics"}.`);
  const empty = segments.filter((s) => s.cards === 0 && !NOT_A_TOPIC.test(s.label.trim()));
  if (empty.length > 0) concerns.push(`${empty.length === 1 ? "One unit has" : `${empty.length} units have`} no flashcards yet: ${list(empty.slice(0, 6))}${empty.length > 6 ? ", …" : ""}.`);
  if (segments.length > 0 && loose.length > index.nodes.length * 0.3) concerns.push(`${loose.length} of ${index.nodes.length} notes are not in any unit.`);

  return {
    basis: index.hasManifest
      ? "the units listed in this vault's study.yml"
      : index.style === "wiki-schema"
        ? "the lecture each note says it comes from"
        : "each note's tags and week or chapter, and otherwise the folder it is in",
    segments,
    unplaced: { count: loose.length, sample: loose.slice(0, SAMPLE_TITLES).map((node) => node.title) },
    concerns,
    totals: { notes: index.nodes.length, cards: index.cards.length },
  };
}

/** Changes when units are added, removed or renamed: the student is then asked to look again. */
export function segmentSignature(index: Pick<VaultIndex, "units">): string {
  return index.units.map((unit) => `${unit.id}=${unit.label}`).sort().join("|");
}

const key = (vaultId: string) => `segments-ok:${vaultId}`;

export function segmentsConfirmed(vaultId: string, index: Pick<VaultIndex, "units">): boolean {
  return getSetting(getDb(), key(vaultId)) === segmentSignature(index);
}

export function confirmSegments(vaultId: string, index: Pick<VaultIndex, "units">): void {
  setSetting(getDb(), key(vaultId), segmentSignature(index));
}
