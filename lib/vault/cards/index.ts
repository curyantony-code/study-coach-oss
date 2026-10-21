import { parseSections } from "../notes";
import type { Card, Node, VaultStyle } from "../types";
import { FALLBACK_SOURCES, GENERIC_DEFAULT_SOURCES, genericRules } from "./generic-rules";
import { extractProblems } from "./problem-rule";
import type { CardDraft, CardRule } from "./types";
import { WIKI_DEFAULT_SOURCES, untypedWikiRules, wikiRules } from "./wiki-rules";

const MIN_FRONT_LENGTH = 5;

/** Same hash the original app used, so existing card ids do not change. */
export function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/** The vault's own style wins when both styles define a rule of the same name ("tables"). */
function rulesFor(style: VaultStyle): Record<string, CardRule> {
  return style === "wiki-schema" ? { ...genericRules, ...wikiRules } : { ...untypedWikiRules, ...genericRules };
}

export function defaultCardSources(style: VaultStyle): string[] {
  return style === "wiki-schema" ? WIKI_DEFAULT_SOURCES : GENERIC_DEFAULT_SOURCES;
}

function toCard(draft: CardDraft, node: Node): Card {
  return {
    id: hashStr((draft.idKey ?? draft.front) + node.slug),
    nodeId: node.id,
    front: draft.front.trim(),
    back: draft.back.trim(),
    type: draft.type,
    unitIds: node.unitIds,
    tags: node.tags,
    ...(draft.problem ? { problem: draft.problem } : {}),
  };
}

/** Worked problems are recognised in every vault unless study.yml lists card sources without "problems". */
export const PROBLEMS_SOURCE = "problems";

export interface CardExtraction {
  cards: Card[];
  warnings: string[];
}

export function extractCards(nodes: Node[], style: VaultStyle, requestedSources?: string[]): CardExtraction {
  const available = rulesFor(style);
  const requested = requestedSources ?? defaultCardSources(style);
  const wantsProblems = requestedSources === undefined || requested.includes(PROBLEMS_SOURCE);
  const unknown = requested.filter((name) => !available[name] && name !== PROBLEMS_SOURCE);
  const names = requested.filter((name) => available[name]);
  const primary = names.filter((n) => !FALLBACK_SOURCES.has(n));
  const fallback = names.filter((n) => FALLBACK_SOURCES.has(n));

  const cards: Card[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    const problems = wantsProblems ? extractProblems(node.body) : { drafts: [], spans: [], remainingBody: node.body };
    // The other rules never see problem sections, so "Formula required" and "Solution" are not made into cards.
    const rest = { ...node, body: problems.remainingBody };
    const ctx = { node: rest, sections: parseSections(rest.body) };
    const run = (ruleNames: string[]) => ruleNames.flatMap((name) => available[name](ctx)).map((d) => toCard(d, node));
    const found = [...problems.drafts.map((d) => toCard(d, node)), ...run(primary)];
    const candidates = found.length > 0 ? found : run(fallback);
    for (const card of candidates) {
      if (card.front.length < MIN_FRONT_LENGTH || seen.has(card.id)) continue;
      seen.add(card.id);
      cards.push(card);
    }
  }

  const warnings = unknown.map(
    (name) => `study.yml lists an unknown card source "${name}". Known: ${Object.keys(available).join(", ")}.`
  );
  return { cards, warnings };
}
