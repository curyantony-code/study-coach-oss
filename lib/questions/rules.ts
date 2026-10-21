// THE PROJECT RULE FOR QUESTIONS (applies to every vault and every place a question is shown
// or written): a question must be answerable on its own. See docs/question-rules.md.
//
// This file is the single home of that rule: the checks that find questions breaking it, and
// the wording every AI prompt uses so that newly written questions keep to it.
import { missingDetails } from "../problems/completeness";

export type IssueKind = "missing-detail" | "nothing-asked" | "leans-on-another";

export interface QuestionIssue {
  kind: IssueKind;
  /** One plain sentence for the student. */
  message: string;
}

/** Words that ask for something, in any course. */
const ASKS = /\?|\b(find|compute|calculate|determine|derive|show|prove|explain|describe|compare|contrast|classify|identify|list|name|state|define|evaluate|estimate|price|value|rank|choose|select|decide|draw|plot|sketch|construct|build|replicate|solve|verify|check|test|rework|interpret|discuss|justify|recommend|outline|summari[sz]e|tabulate|approximate|recalculate|recompute|split|allocate|apply|use|give|write|express|convert|complete|fill in|what|which|why|how|when|who|is it|are they|should|does|do)\b/i;
/** Phrases that only make sense next to some other question. */
const LEANS = /^(same\b|as (above|before)\b|again\b|repeat\b|continuing\b|now (suppose|assume|let)\b|using the (above|same|previous)\b|with the (above|same|previous)\b|from (the )?(above|previous|last)\b)|\b(previous|preceding|above|last|prior|earlier) (problem|question|example|part)\b|\bsame (data|table|firm|setup|set-up|inputs?|numbers|information|stock|bond|company)\b|\b(the|that) P\d+ (stock|data|firm|bond)\b|\b(other|remaining|all other|the other) (inputs?|data|values|assumptions|numbers) (are |stay |remain )?(unchanged|the same|as before)\b/i;
const MIN_WORDS_TO_JUDGE = 3;

/**
 * Every way a question breaks the rule. Empty when it stands on its own.
 * `solution` and `name` are optional context: the worked answer shows what the question should
 * have stated, and the example's name sometimes carries a detail the question omits.
 */
export function questionIssues(question: string, solution = "", name = ""): QuestionIssue[] {
  const text = question.trim();
  const issues: QuestionIssue[] = [];
  if (text.split(/\s+/).length < MIN_WORDS_TO_JUDGE) return issues;

  if (LEANS.test(text)) {
    issues.push({ kind: "leans-on-another", message: "It refers to another question (“same data”, “the previous problem”) instead of giving its own numbers." });
  }
  // Money ("\$50") is not a formula; formulas are set aside so their letters are not read as words.
  const prose = text.replace(/\\\$/g, " ").replace(/\$[^$\n]*\$/g, " ");
  // Labelled parts ("(a) call; (b) put") are requests even without a verb.
  if (!ASKS.test(prose) && !/\(\s*[a-e]\s*\)/i.test(prose)) {
    issues.push({ kind: "nothing-asked", message: "It lists what is given but never says what to find." });
  }
  const missing = solution ? missingDetails(text, solution, name) : [];
  if (missing.length > 0) {
    issues.push({ kind: "missing-detail", message: `Its solution also works with ${missing.join(", ")}, which the question never mentions.` });
  }
  return issues;
}

/**
 * The rule as every AI prompt states it. Any feature that has an AI write a question must
 * include this text, so the same standard holds everywhere.
 */
export const SELF_CONTAINED_RULE = `EVERY QUESTION MUST STAND ON ITS OWN
- State every value needed to answer it: amounts, rates, time frames, compounding, units, and each case to be compared.
- Say exactly what must be found or decided. A list of givens is not a question.
- Never rely on another question ("same data", "as above", "the previous problem"): restate what is needed.
- Never include the answer, or any value the solution computes.`;
