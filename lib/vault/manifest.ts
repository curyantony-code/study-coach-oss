import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { normalizeUnitKey } from "./units";

export const MANIFEST_FILE = "study.yml";

const isoDate = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")
);

const unitId = z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string().min(1));

const unitSchema = z.object({
  id: unitId,
  label: z.string().min(1),
  aliases: z.array(unitId).default([]),
});

const assessmentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["quiz", "test", "midterm", "final"]).optional(),
  date: isoDate.nullish(),
  weight: z.number().min(0).max(100).optional(),
  format: z.array(z.string()).default([]),
  covers: z.union([z.literal("all"), z.array(unitId)]).default("all"),
  emphasis: z.array(unitId).default([]),
  practice: z.array(z.string()).default([]),
});

export const manifestSchema = z.object({
  course: z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    term: z.string().optional(),
    textbook: z.string().optional(),
  }),
  content: z
    .object({
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).default([]),
    })
    .optional(),
  units: z.array(unitSchema).default([]),
  assessments: z.array(assessmentSchema).default([]),
  cards: z
    .object({
      sources: z.array(z.string()).optional(),
      kind: z.enum(["conceptual", "procedural", "mixed"]).default("conceptual"),
    })
    .optional(),
});

export type Manifest = z.infer<typeof manifestSchema>;

export type ManifestResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; errors: string[] };

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return [...dupes];
}

/** Checks that cannot be expressed per-field: duplicate ids and unknown unit references. */
function crossCheck(manifest: Manifest): string[] {
  const errors: string[] = [];
  // Compare canonical forms so "wk3" and "Week 3" count as the same name.
  const unitKeys = manifest.units.flatMap((u) => [u.id, ...u.aliases]).map((k) => normalizeUnitKey(k)?.id ?? k.toLowerCase());
  for (const d of duplicates(unitKeys)) errors.push(`units: "${d}" is used more than once`);
  for (const d of duplicates(manifest.assessments.map((a) => a.id))) {
    errors.push(`assessments: id "${d}" is used more than once`);
  }
  const known = new Set(unitKeys);
  for (const a of manifest.assessments) {
    const refs = [...(a.covers === "all" ? [] : a.covers), ...a.emphasis];
    for (const ref of refs) {
      if (!known.has(normalizeUnitKey(ref)?.id ?? ref.toLowerCase())) errors.push(`assessments.${a.id}: unknown unit "${ref}"`);
    }
  }
  return errors;
}

export function parseManifest(text: string): ManifestResult {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    return { ok: false, errors: [`Not valid YAML: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "study.yml"}: ${i.message}`),
    };
  }
  const errors = crossCheck(parsed.data);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, manifest: parsed.data };
}

export function manifestToYaml(manifest: Manifest): string {
  return stringifyYaml(manifest, { lineWidth: 0 });
}
