// Compatibility layer: the study modes still think in "wiki pages". They now read
// from whichever vault is active (see lib/vault/) instead of one hard-wired folder.
import path from "path";
import { getActiveContent } from "./vault/active";
import { parseSections } from "./vault/notes";
import { renderNoteHtml } from "./vault/render";
import type { Node, NodeType } from "./vault/types";

export type WikiPageType = NodeType;

export interface WikiPage {
  slug: string;
  filePath: string;
  title: string;
  type: WikiPageType;
  tags: string[];
  sources: string[];
  updated: string;
  rawContent: string;
  /** Rendered only by getPage(); empty in getAllPages() to keep listing fast. */
  html: string;
  sections: Record<string, string>;
}

function toPage(node: Node, vaultPath: string, html = ""): WikiPage {
  return {
    slug: node.slug,
    filePath: path.join(vaultPath, node.id),
    title: node.title,
    type: node.type,
    tags: node.tags,
    // Units first so the week filters keep working; raw `sources` values follow.
    sources: [...new Set([...node.unitIds, ...node.sources])],
    updated: node.updated,
    rawContent: node.body,
    html,
    sections: parseSections(node.body),
  };
}

export async function getAllPages(): Promise<WikiPage[]> {
  const active = await getActiveContent();
  if (!active) return [];
  return active.index.nodes.map((node) => toPage(node, active.vault.path));
}

export async function getPage(slug: string): Promise<WikiPage | null> {
  const active = await getActiveContent();
  const node = active?.index.nodes.find((n) => n.slug === slug);
  if (!active || !node) return null;
  // Problems in this note that have the textbook's full wording are shown with it.
  const originals = new Map(
    active.index.cards.flatMap((card) =>
      card.nodeId === node.id && card.problem?.original ? [[card.problem.heading, { text: card.front, source: card.problem.original.source }] as const] : []
    )
  );
  return toPage(node, active.vault.path, await renderNoteHtml(node, active.index.nodes, originals));
}

export async function getPagesByType(type: WikiPageType): Promise<WikiPage[]> {
  return (await getAllPages()).filter((p) => p.type === type);
}
