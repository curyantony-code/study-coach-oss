import type { Manifest } from "./manifest";
import { toList, type ParsedNote } from "./notes";
import type { Unit, VaultStyle } from "./types";

const UNIT_KEY = /^(wk|week|w|ch|chap|chapter|unit|module|mod|lecture|lec)[-_ ]?0*(\d+)$/i;

const PREFIXES: Record<string, { prefix: string; word: string }> = {
  wk: { prefix: "wk", word: "Week" },
  week: { prefix: "wk", word: "Week" },
  w: { prefix: "wk", word: "Week" },
  ch: { prefix: "ch", word: "Chapter" },
  chap: { prefix: "ch", word: "Chapter" },
  chapter: { prefix: "ch", word: "Chapter" },
  unit: { prefix: "unit", word: "Unit" },
  module: { prefix: "mod", word: "Module" },
  mod: { prefix: "mod", word: "Module" },
  lecture: { prefix: "lec", word: "Lecture" },
  lec: { prefix: "lec", word: "Lecture" },
};

/** Frontmatter fields whose bare numbers mean a specific kind of unit (`week: 3` → wk3). */
const NUMBER_FIELDS: Record<string, string> = { week: "wk", chapter: "ch", unit: "unit", module: "mod", lecture: "lec" };

interface UnitKey {
  id: string;
  label: string;
}

/** Turns "Week 3", "wk03", "ch-9" into a canonical id and label, or null if it is not a unit key. */
export function normalizeUnitKey(raw: string): UnitKey | null {
  const match = raw.trim().match(UNIT_KEY);
  if (!match) return null;
  const { prefix, word } = PREFIXES[match[1].toLowerCase()];
  return { id: `${prefix}${match[2]}`, label: `${word} ${match[2]}` };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Every value in a note that might name a unit: frontmatter fields first, then tags. */
function rawUnitKeys(note: ParsedNote): string[] {
  const fm = note.frontmatter;
  // `week: 3` or `chapter: [5, 6]` name units. A phrase such as `chapter: "Node 2 - Ch 7"` is a
  // description: picking numbers out of it would be a guess, so it is left to the folder.
  const numbered = Object.entries(NUMBER_FIELDS).flatMap(([field, prefix]) => {
    const raw = fm[field];
    const values = Array.isArray(raw) ? raw.map(String) : raw === undefined || raw === null ? [] : [String(raw)];
    return values.flatMap((value) => {
      const whole = value.trim();
      if (/^\d+$/.test(whole)) return [`${prefix}${whole}`];
      if (normalizeUnitKey(whole)) return [whole];
      // "5, 6" or "wk1 wk2" lists several units; any other wording makes the whole value a description.
      const tokens = whole.split(/[,\s]+/).filter(Boolean);
      const allUnits = tokens.length > 1 && tokens.every((t) => /^\d+$/.test(t) || normalizeUnitKey(t) !== null);
      return allUnits ? tokens.map((t) => (/^\d+$/.test(t) ? `${prefix}${t}` : t)) : [];
    });
  });
  return [...note.sources, ...toList(fm.units), ...numbered, ...note.tags];
}

function byNaturalId(a: Unit, b: Unit): number {
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}

/** Reads "| 3 | Workplace Laws |" rows under a "Course Arc" heading into week labels. */
export function parseCourseArc(overviewBody: string): Map<string, string> {
  const labels = new Map<string, string>();
  const section = overviewBody.split(/^## /m).find((s) => /^course arc/i.test(s));
  if (!section) return labels;
  for (const row of section.matchAll(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*$/gm)) {
    labels.set(`wk${row[1]}`, `Week ${row[1]} — ${row[2].replace(/[*_]/g, "")}`);
  }
  return labels;
}

function wikiLabel(unit: UnitKey, notes: ParsedNote[], courseArc: Map<string, string>): string {
  const lecture = notes.find((n) => {
    const base = n.slug.split("/").pop() ?? "";
    return n.type === "source" && (base === unit.id || base.startsWith(`${unit.id}-`));
  });
  return lecture?.title ?? courseArc.get(unit.id) ?? unit.label;
}

export interface UnitAssignment {
  units: Unit[];
  /** note id → unit ids */
  byNote: Map<string, string[]>;
}

function inferUnits(notes: ParsedNote[], style: VaultStyle): UnitAssignment {
  const found = new Map<string, UnitKey>();
  const byNote = new Map<string, string[]>();

  for (const note of notes) {
    const keys = rawUnitKeys(note)
      .map(normalizeUnitKey)
      .filter((k): k is UnitKey => k !== null);
    // Folders only decide the unit when the note itself does not say.
    if (keys.length === 0 && style === "generic" && note.folder) {
      keys.push({ id: slugify(note.folder) || note.folder, label: note.folder });
    }
    for (const key of keys) if (!found.has(key.id)) found.set(key.id, key);
    byNote.set(note.id, [...new Set(keys.map((k) => k.id))]);
  }

  const overview = notes.find((n) => n.type === "overview" || n.slug === "overview");
  const courseArc = style === "wiki-schema" && overview ? parseCourseArc(overview.body) : new Map<string, string>();
  const units = [...found.values()]
    .map((key) => ({
      id: key.id,
      label: style === "wiki-schema" ? wikiLabel(key, notes, courseArc) : key.label,
      aliases: [] as string[],
      order: 0,
    }))
    .sort(byNaturalId)
    .map((unit, order) => ({ ...unit, order }));

  return { units, byNote };
}

/** Maps every way of naming a unit (id, alias, label, their canonical forms) to its id. */
export function buildAliasMap(units: Pick<Unit, "id" | "label" | "aliases">[]): Map<string, string> {
  const map = new Map<string, string>();
  const add = (key: string, id: string) => {
    const lower = key.toLowerCase();
    if (!map.has(lower)) map.set(lower, id);
  };
  for (const unit of units) {
    for (const name of [unit.id, ...unit.aliases]) {
      add(name, unit.id);
      const canonical = normalizeUnitKey(name);
      if (canonical) add(canonical.id, unit.id);
    }
  }
  // Labels are the weakest match, so they never shadow an id or alias.
  for (const unit of units) {
    add(unit.label, unit.id);
    add(slugify(unit.label), unit.id);
  }
  return map;
}

export function resolveUnitKey(raw: string, aliasMap: Map<string, string>): string | null {
  const direct = aliasMap.get(raw.trim().toLowerCase());
  if (direct) return direct;
  const canonical = normalizeUnitKey(raw);
  return (canonical && aliasMap.get(canonical.id)) ?? aliasMap.get(slugify(raw)) ?? null;
}

function assignFromManifest(notes: ParsedNote[], manifest: Manifest): UnitAssignment {
  const units = manifest.units.map((u, order) => ({ id: u.id, label: u.label, aliases: u.aliases, order }));
  const aliasMap = buildAliasMap(units);
  const byNote = new Map<string, string[]>();
  for (const note of notes) {
    const resolveAll = (keys: string[]) =>
      keys.map((k) => resolveUnitKey(k, aliasMap)).filter((id): id is string => id !== null);
    const named = resolveAll(rawUnitKeys(note));
    // Same precedence as inference: the folder only decides when the note itself does not say.
    const ids = named.length > 0 || !note.folder ? named : resolveAll([note.folder]);
    byNote.set(note.id, [...new Set(ids)]);
  }
  return { units, byNote };
}

export function assignUnits(notes: ParsedNote[], style: VaultStyle, manifest: Manifest | null): UnitAssignment {
  return manifest && manifest.units.length > 0 ? assignFromManifest(notes, manifest) : inferUnits(notes, style);
}
