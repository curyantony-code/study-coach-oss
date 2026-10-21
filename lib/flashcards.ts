import type { CardType, VaultIndex } from "./vault/types";

/** Card shape the study modes use. Built from the active vault's index. */
export interface Flashcard {
  id: string;
  front: string;
  back: string;
  source: string;
  tags: string[];
  type: CardType;
  week?: string;
}

export function toFlashcards(index: VaultIndex): Flashcard[] {
  const slugById = new Map(index.nodes.map((n) => [n.id, n.slug]));
  return index.cards.map((card) => ({
    id: card.id,
    front: card.front,
    back: card.back,
    source: slugById.get(card.nodeId) ?? card.nodeId,
    tags: card.tags,
    type: card.type,
    week: card.unitIds[0],
  }));
}
