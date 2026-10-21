// Card rules for wiki-schema vaults, ported unchanged from the original lib/flashcards.ts
// so that card ids (and therefore saved progress) stay stable.
import type { CardDraft, CardRule } from "./types";

const examTips: CardRule = ({ node }) => {
  const drafts: CardDraft[] = [];
  const regex = /> \*\*Exam tip:\*\* (.+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(node.body)) !== null) {
    const text = m[1].trim();
    const arrow = text.indexOf(" → ");
    if (arrow !== -1) {
      drafts.push({ front: text.slice(0, arrow), back: text.slice(arrow + 3), type: "exam-tip" });
      continue;
    }
    // Use first clause as front
    const colon = text.indexOf(": ");
    const dash = text.indexOf(" — ");
    const split = colon !== -1 && (dash === -1 || colon < dash) ? colon : dash;
    if (split !== -1) {
      drafts.push({ front: text.slice(0, split), back: text.slice(split + (text[split] === ":" ? 2 : 3)), type: "exam-tip" });
    } else {
      drafts.push({ front: text, back: text, type: "exam-tip" });
    }
  }
  return drafts;
};

function bulletLines(section: string): string[] {
  return section
    .split("\n")
    .filter((l) => l.match(/^[-*]\s/))
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}

const highlights: CardRule = ({ sections }) => {
  const drafts: CardDraft[] = [];
  for (const text of bulletLines(sections["Exam-Relevant Highlights"] || "")) {
    const arrow = text.indexOf(" → ");
    const dash = text.indexOf(" — ");
    const eq = text.indexOf(" = ");
    const split = arrow !== -1 ? arrow : dash !== -1 ? dash : eq;
    if (split !== -1) {
      const sep = text[split] === " " ? text.slice(split, split + 3) : ": ";
      drafts.push({ front: text.slice(0, split), back: text.slice(split + sep.length), type: "highlight" });
    } else if (text.length > 10) {
      drafts.push({ front: text, back: text, type: "highlight" });
    }
  }
  return drafts;
};

const misconceptions: CardRule = ({ sections }) => {
  const section = sections["Common Misconceptions"] || sections["Common misconceptions"] || "";
  return bulletLines(section).map((text): CardDraft => {
    // Pattern: "Myth: ... | Fact: ..." or just the misconception statement
    const fact = text.match(/(?:fact|reality|correction|truth)[:\s]+(.+)/i);
    const myth = text.match(/(?:myth|misconception|wrong|false)[:\s]+(.+)/i);
    if (fact && myth) {
      return { front: `Misconception: ${myth[1]}`, back: `Correction: ${fact[1]}`, type: "misconception" };
    }
    if (text.includes(" — ")) {
      const [front, back] = text.split(" — ");
      return { front: `True or False: ${front}`, back: `False. ${back}`, type: "misconception" };
    }
    return { front: `True or False: ${text}`, back: "False — this is a common misconception.", type: "misconception" };
  });
};

const USEFUL_TABLE_HEADER = /component|definition|level|step|stage|factor|element|dimension|cue|attribute/i;

const tables: CardRule = ({ node }) => {
  const drafts: CardDraft[] = [];
  const tableRegex = /\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/g;
  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(node.body)) !== null) {
    const headerCells = m[1].split("|").map((c) => c.trim()).filter(Boolean);
    // Only use tables with component/definition style headers
    if (!headerCells.some((h) => USEFUL_TABLE_HEADER.test(h))) continue;
    for (const row of m[2].trim().split("\n")) {
      const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      drafts.push({
        front: `${headerCells[0]}: ${cells[0]}`,
        back: cells.slice(1).map((c, i) => `${headerCells[i + 1] || ""}: ${c}`).join(" | "),
        type: "table-row",
      });
    }
  }
  return drafts;
};

/** For vaults without page types: every rule runs on every note. */
export const untypedWikiRules: Record<string, CardRule> = {
  "exam-tips": examTips,
  highlights,
  misconceptions,
  tables,
};

/** In a typed wiki, misconceptions and tables are only reliable on entity pages. */
const entityOnly = (rule: CardRule): CardRule => (ctx) => (ctx.node.type === "entity" ? rule(ctx) : []);

export const wikiRules: Record<string, CardRule> = {
  ...untypedWikiRules,
  misconceptions: entityOnly(misconceptions),
  tables: entityOnly(tables),
};

export const WIKI_DEFAULT_SOURCES = ["exam-tips", "highlights", "misconceptions", "tables"];
