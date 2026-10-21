export interface DiagMCQ {
  stem: string;
  options: string[];
  correct: string;
  explanation: string;
  sourceSlug: string;
  group: "late" | "early";
}

export interface DiagSA {
  stem: string;
  concept: string;
  sourceSlug: string;
  group: "late" | "early";
}

export interface SaGradeItem {
  index: number;
  stem: string;
  concept: string;
  sourceSlug: string;
  studentAnswer: string;
}

export interface SaGradeResult {
  index: number;
  score: number;
  feedback: string;
}
