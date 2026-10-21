import { stripCode } from "./notes";
import type { BrokenLink, Edge, Node } from "./types";

const WIKILINK = /(!?)\[\[([^\]\n]+)\]\]/g;
const NON_NOTE_EXTENSION = /\.(png|jpe?g|gif|svg|webp|pdf|mp3|mp4|mov|canvas|base|excalidraw)$/i;

export interface Wikilink {
  target: string;
  alias: string | null;
  /** The heading after "#", if the link points at a section. */
  heading: string | null;
}

/** Splits "Note#Heading|Shown text" into the note it points at, the section, and the text to show. */
export function parseWikilink(inner: string): Wikilink {
  // "\|" is how a pipe is written inside a table cell.
  const [targetPart, alias] = inner.replace(/\\\|/g, "|").split("|");
  const [target, ...rest] = targetPart.split("#");
  const section = rest.join("#").trim();
  // "#^abc" and "Note^abc" point at a block, not a heading. A "^" inside a heading ("$\sigma^2$") is just text.
  const heading = section.startsWith("^") ? "" : section.replace(/\s*\^[\w-]+$/, "");
  return { target: target.split("^")[0].trim(), alias: alias?.trim() || null, heading: heading || null };
}

/** Note targets linked from a body. Skips code, image/file embeds and same-note heading links. */
export function extractLinkTargets(body: string): string[] {
  const targets: string[] = [];
  for (const match of stripCode(body).matchAll(WIKILINK)) {
    const { target } = parseWikilink(match[2]);
    if (target && !NON_NOTE_EXTENSION.test(target)) targets.push(target);
  }
  return [...new Set(targets)];
}

function baseName(p: string): string {
  return (p.split("/").pop() ?? p).replace(/\.md$/i, "").toLowerCase();
}

export type LinkResolver = (target: string) => Node | undefined;

/** Obsidian-style lookup: full path, then Library slug, then bare note name. */
export function buildResolver(nodes: Node[]): LinkResolver {
  const byKey = new Map<string, Node>();
  const add = (key: string, node: Node) => {
    const lower = key.toLowerCase();
    if (!byKey.has(lower)) byKey.set(lower, node);
  };
  for (const node of nodes) {
    add(node.id, node);
    add(node.id.replace(/\.md$/i, ""), node);
    add(node.slug, node);
  }
  for (const node of nodes) add(baseName(node.id), node);
  return (target) => byKey.get(target.replace(/\.md$/i, "").trim().toLowerCase());
}

export interface LinkGraph {
  edges: Edge[];
  brokenLinks: BrokenLink[];
}

/**
 * Builds the knowledge graph. A link to a note that exists in the vault but is outside
 * the studied content is simply left out; only links to nothing at all count as broken.
 */
export function buildLinkGraph(nodes: Node[], allVaultPaths: string[]): LinkGraph {
  const resolve = buildResolver(nodes);
  const outsideScope = new Set(allVaultPaths.map(baseName));
  const edges: Edge[] = [];
  const brokenLinks: BrokenLink[] = [];

  for (const node of nodes) {
    const seen = new Set<string>();
    for (const target of extractLinkTargets(node.body)) {
      const hit = resolve(target);
      if (!hit) {
        if (!outsideScope.has(baseName(target))) brokenLinks.push({ from: node.id, target });
        continue;
      }
      if (hit.id === node.id || seen.has(hit.id)) continue;
      seen.add(hit.id);
      edges.push({ from: node.id, to: hit.id });
    }
  }
  return { edges, brokenLinks };
}
