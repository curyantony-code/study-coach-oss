// Core content model. Names match docs/ARCHITECTURE.md and are used in code and UI.

export type VaultStyle = "wiki-schema" | "generic";

export type NodeType = "source" | "concept" | "entity" | "overview" | "note";

export type CardType =
  | "exam-tip"
  | "highlight"
  | "misconception"
  | "table-row"
  | "callout"
  | "qa"
  | "definition"
  | "heading"
  | "problem";

/** Extra detail carried by worked-problem cards. */
export interface ProblemInfo {
  /** The heading the problem sits under, e.g. "Ch7-CFA5 Diversification Statement". */
  heading: string;
  /** The "Formula required" line, shown as an optional hint. */
  formula: string | null;
  /** A parenthetical on the problem label, e.g. "Canadian CFA 1 = US CFA 2". */
  note: string | null;
  /** Set when the question shown is the textbook's full wording rather than the note's summary. */
  original?: OriginalQuestion;
  /** Other wordings of this question the student can switch to (written by the AI, kept in the app). */
  versions?: QuestionVersions;
}

export interface QuestionVersions {
  /** Every given and exactly what to find, in full sentences. */
  full: string;
  /** The same question cut down to its givens and what to find. Null if none was made. */
  condensed: string | null;
  /** The question exactly as the note has it. */
  note: string;
}

export interface OriginalQuestion {
  /** Where the wording came from, e.g. "Finance Basics 2e - Problem Sets.pdf · Chapter 7, Problem 6". */
  source: string;
  /** The shorter version written in the student's notes. */
  noteVersion: string;
  /** True when the textbook text shares almost no words with the note's version: it may be a different problem. */
  uncertain: boolean;
  /** True when the wording is the note's own question written out in full by the AI, not a textbook's. */
  completed?: boolean;
}

export type AssessmentType = "quiz" | "test" | "midterm" | "final";

export interface Course {
  name: string;
  code?: string;
  term?: string;
  textbook?: string;
}

export interface Unit {
  id: string;
  label: string;
  aliases: string[];
  order: number;
}

export interface Assessment {
  id: string;
  label: string;
  type?: AssessmentType;
  /** ISO date (YYYY-MM-DD) or null when the owner has not set one yet. */
  date: string | null;
  weight?: number;
  format: string[];
  /** Resolved unit ids. `covers: all` in the manifest expands to every unit. */
  covers: string[];
  cumulative: boolean;
  emphasis: string[];
  /** Vault-relative paths of practice-exam notes. */
  practice: string[];
}

export interface Node {
  /** Vault-relative path, e.g. "wiki/concepts/dei.md". */
  id: string;
  /** URL-friendly id used by the Library, e.g. "concepts/dei". */
  slug: string;
  title: string;
  type: NodeType;
  tags: string[];
  unitIds: string[];
  /** Raw frontmatter `sources` values (wiki-schema vaults). */
  sources: string[];
  updated: string;
  body: string;
}

export interface Edge {
  from: string;
  to: string;
}

export interface Card {
  id: string;
  nodeId: string;
  front: string;
  back: string;
  type: CardType;
  unitIds: string[];
  tags: string[];
  problem?: ProblemInfo;
}

export interface BrokenLink {
  from: string;
  target: string;
}

export interface VaultIndex {
  style: VaultStyle;
  hasManifest: boolean;
  course: Course;
  units: Unit[];
  assessments: Assessment[];
  nodes: Node[];
  edges: Edge[];
  cards: Card[];
  brokenLinks: BrokenLink[];
  warnings: string[];
}

/** A markdown file read from disk, before it becomes a Node. */
export interface RawNote {
  /** Vault-relative path with forward slashes. */
  path: string;
  content: string;
}
