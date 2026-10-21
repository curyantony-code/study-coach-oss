import { defaultCardSources } from "./cards";
import { DRAFTS_DIR } from "./files";
import { manifestToYaml, type Manifest } from "./manifest";
import type { VaultIndex } from "./types";

const DRAFT_HEADER = [
  "# study.yml — tells Study Coach how this vault is organised.",
  "# Drafted from your folders, tags and note properties. Check the unit labels,",
  "# then add your tests under `assessments` (see the commented example at the bottom).",
  "",
].join("\n");

const ASSESSMENT_EXAMPLE = [
  "",
  "# Example assessment — remove the # signs and edit:",
  "# assessments:",
  "#   - id: midterm",
  "#     label: Midterm",
  "#     type: midterm            # quiz | test | midterm | final",
  "#     date: 2026-02-20",
  "#     weight: 20",
  "#     format: [mcq, short-answer]",
  "#     covers: [UNIT_ID, UNIT_ID]  # or: all",
  "",
].join("\n");

/** Proposes a manifest from what the index already inferred. The owner edits and approves it. */
export function draftManifest(index: VaultIndex): string {
  const manifest: Manifest = {
    course: index.course,
    content: {
      include: index.style === "wiki-schema" ? ["wiki/**"] : ["**"],
      exclude: [`${DRAFTS_DIR}/**`],
    },
    units: index.units.map((u) => ({ id: u.id, label: u.label, aliases: u.aliases })),
    assessments: [],
    cards: { sources: defaultCardSources(index.style), kind: "conceptual" },
  };
  return DRAFT_HEADER + manifestToYaml(manifest) + ASSESSMENT_EXAMPLE;
}
