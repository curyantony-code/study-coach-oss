import { extractCards } from "./cards";
import { filterByGlobs } from "./files";
import { buildLinkGraph } from "./links";
import { parseManifest, type Manifest } from "./manifest";
import { parseNote, type ParsedNote } from "./notes";
import type { Assessment, Course, Node, Unit, VaultIndex, VaultStyle } from "./types";
import { assignUnits, buildAliasMap, resolveUnitKey } from "./units";

const WIKI_ROOT = "wiki/";
const WIKI_PAGE = /^wiki\/(sources|concepts|entities)\/.+\.md$/i;
const COURSE_CODE = /^([A-Z]{2,5} ?\d{2,4}[A-Z]?)\b/;

export interface BuildInput {
  /** Folder name of the vault; the course name when nothing better is known. */
  vaultName: string;
  /** Every markdown path in the vault (vault-relative). */
  paths: string[];
  read: (path: string) => string;
  /** Contents of study.yml, or null when the vault has none. */
  manifestText: string | null;
}

/** Detection order from docs/ARCHITECTURE.md; a manifest overrides whatever is detected. */
export function detectStyle(paths: string[]): VaultStyle {
  return paths.some((p) => WIKI_PAGE.test(p)) ? "wiki-schema" : "generic";
}

function inferCourse(vaultName: string, notes: ParsedNote[]): Course {
  const overview = notes.find((n) => n.type === "overview");
  const title = overview?.title.replace(/\s+[—–-]\s+(course )?overview$/i, "").trim();
  const name = title || vaultName;
  const code = name.match(COURSE_CODE)?.[1];
  // A title that is only the code ("BUS 100") would otherwise be shown twice.
  return code && code !== name ? { name, code } : { name };
}

function toAssessments(manifest: Manifest, units: Unit[]): Assessment[] {
  const aliasMap = buildAliasMap(units);
  const resolve = (keys: string[]) =>
    [...new Set(keys.map((k) => resolveUnitKey(k, aliasMap)).filter((id): id is string => id !== null))];
  return manifest.assessments.map((a) => ({
    id: a.id,
    label: a.label,
    type: a.type,
    date: a.date ?? null,
    weight: a.weight,
    format: a.format,
    covers: a.covers === "all" ? units.map((u) => u.id) : resolve(a.covers),
    cumulative: a.covers === "all",
    emphasis: resolve(a.emphasis),
    practice: a.practice,
  }));
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function healthWarnings(index: Omit<VaultIndex, "warnings">, notes: ParsedNote[]): string[] {
  const warnings: string[] = [];
  const unreadable = notes.filter((n) => n.problem);
  if (unreadable.length > 0) {
    warnings.push(`${plural(unreadable.length, "note")} with unreadable properties: ${unreadable.map((n) => n.id).join(", ")}`);
  }
  if (index.nodes.length === 0) warnings.push("No notes found to study from.");
  if (index.nodes.length > 0 && index.units.length === 0) {
    warnings.push("No units found. Group notes into folders, tag them (#ch1, #wk1), or add a study.yml.");
  }
  const orphans = index.nodes.filter((n) => n.unitIds.length === 0).length;
  if (index.units.length > 0 && orphans > 0) warnings.push(`${plural(orphans, "note")} not in any unit.`);
  if (index.brokenLinks.length > 0) warnings.push(`${plural(index.brokenLinks.length, "link")} pointing to notes that do not exist.`);
  if (!index.hasManifest) warnings.push("No study.yml, so there are no assessments (tests, midterms, finals) yet.");
  if (index.hasManifest && index.assessments.length === 0) warnings.push("study.yml lists no assessments (tests, midterms, finals) yet.");
  for (const a of index.assessments) {
    if (!a.date) warnings.push(`Assessment "${a.label}" has no date.`);
    if (a.covers.length === 0) warnings.push(`Assessment "${a.label}" does not cover any known unit.`);
  }
  return warnings;
}

export function buildIndex(input: BuildInput): VaultIndex {
  const style = detectStyle(input.paths);
  const parsedManifest = input.manifestText === null ? null : parseManifest(input.manifestText);
  const manifest = parsedManifest?.ok ? parsedManifest.manifest : null;
  const manifestErrors = parsedManifest && !parsedManifest.ok ? parsedManifest.errors : [];

  // A vault that keeps its notes in wiki/ (next to raw/ source material) is studied from wiki/ only.
  // One stray wiki/ note must not hide a vault that lives elsewhere, so most notes have to be there.
  const inWiki = input.paths.filter((p) => p.startsWith(WIKI_ROOT)).length;
  const hasWikiFolder = style === "wiki-schema" || (inWiki > 0 && inWiki >= input.paths.length / 2);
  const defaultInclude = hasWikiFolder ? [`${WIKI_ROOT}**`] : undefined;
  const included = filterByGlobs(input.paths, manifest?.content?.include ?? defaultInclude, manifest?.content?.exclude ?? []);
  const slugRoot = hasWikiFolder && included.every((p) => p.startsWith(WIKI_ROOT)) ? WIKI_ROOT : "";
  const unreadable: string[] = [];
  const notes = included.flatMap((path) => {
    try {
      return [parseNote({ path, content: input.read(path) }, slugRoot)];
    } catch {
      // Removed or locked between listing and reading: report it and index the rest.
      unreadable.push(path);
      return [];
    }
  });

  const { units, byNote } = assignUnits(notes, style, manifest);
  const nodes: Node[] = notes.map((n) => ({
    id: n.id,
    slug: n.slug,
    title: n.title,
    type: n.type,
    tags: n.tags,
    unitIds: byNote.get(n.id) ?? [],
    sources: n.sources,
    updated: n.updated,
    body: n.body,
  }));

  const { edges, brokenLinks } = buildLinkGraph(nodes, input.paths);
  const extraction = extractCards(nodes, style, manifest?.cards?.sources);
  const index = {
    style,
    hasManifest: manifest !== null,
    course: manifest?.course ?? inferCourse(input.vaultName, notes),
    units,
    assessments: manifest ? toAssessments(manifest, units) : [],
    nodes,
    edges,
    cards: extraction.cards,
    brokenLinks,
  };

  return {
    ...index,
    warnings: [
      ...manifestErrors.map((e) => `study.yml was ignored because of an error — ${e}`),
      ...unreadable.map((path) => `Could not read ${path}.`),
      ...extraction.warnings,
      ...healthWarnings(index, notes),
    ],
  };
}
