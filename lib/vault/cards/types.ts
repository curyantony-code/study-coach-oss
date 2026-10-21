import type { CardType, Node, ProblemInfo } from "../types";

export interface CardDraft {
  front: string;
  back: string;
  type: CardType;
  /** What the card id is derived from when it should not change with the wording. Defaults to `front`. */
  idKey?: string;
  problem?: ProblemInfo;
}

export interface CardRuleContext {
  node: Node;
  /** `## Heading` → text below it, plus `__intro__`. */
  sections: Record<string, string>;
}

export type CardRule = (ctx: CardRuleContext) => CardDraft[];
