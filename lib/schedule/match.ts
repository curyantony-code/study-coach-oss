// Works out which of the vault's units a class in the outline is about, so a task in the plan
// can open the right study session.
import type { Unit } from "../vault/types";
import type { OutlineEntry } from "./outline";

const NUMBERED = /\b(topic|node|chapter|ch|week|module|unit|lecture|part|session)\.?\s*0?(\d{1,2})\b/gi;
const SMALL_WORDS = new Set("the and for with from into of to in on a an its their other how what cont covering introduction course".split(" "));

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z']{2,}/g) ?? []).filter((w) => !SMALL_WORDS.has(w));
}

function firstNumber(label: string): number | null {
  const match = label.match(/\b0?(\d{1,2})\b/);
  return match ? Number(match[1]) : null;
}

/**
 * The unit a class belongs to, or null. A number is the strongest clue ("Topic 2" ↔ "Node 2 -
 * Portfolio Selection", "ch. 7" ↔ "Chapter 7"); failing that, shared words in the names.
 */
export function unitForEntry(entry: Pick<OutlineEntry, "title" | "chapters">, units: Unit[]): string | null {
  if (units.length === 0) return null;
  const titleWords = new Set(words(entry.title));
  const overlap = (unit: Unit) => words([unit.label, ...unit.aliases].join(" ")).filter((w) => titleWords.has(w)).length;

  const numbers = [...entry.title.matchAll(NUMBERED)].map((m) => ({ word: m[1].toLowerCase(), n: Number(m[2]) }));
  const chapterUnits = units.filter((u) => /\bch(apter)?\b/i.test(u.label));
  // Units named by chapter are matched by the chapters the class names, not by "Topic 2".
  if (chapterUnits.length > 0 && entry.chapters.length > 0) {
    const hit = chapterUnits.find((u) => entry.chapters.includes(firstNumber(u.label) ?? -1));
    if (hit) return hit.id;
  }
  const leading = numbers.find((x) => !/^ch/.test(x.word));
  if (leading && chapterUnits.length === 0) {
    const sameNumber = units.filter((u) => firstNumber(u.label) === leading.n);
    if (sameNumber.length === 1) return sameNumber[0].id;
    if (sameNumber.length > 1) return [...sameNumber].sort((a, b) => overlap(b) - overlap(a))[0].id;
  }
  const best = units.map((unit) => ({ unit, shared: overlap(unit) })).sort((a, b) => b.shared - a.shared)[0];
  return best.shared >= 2 ? best.unit.id : null;
}
