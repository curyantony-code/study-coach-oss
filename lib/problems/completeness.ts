// Notes often summarise a worked example's question so tightly that something the solution
// depends on is left out ("Compare the FV of $1,000 at 12%…" with no time frame, while the
// solution works it for 1 year and for 20 years). This spots such gaps without any AI.

const SPAN = /(\d+(?:\.\d+)?)\s*-?\s*(years?|yrs?|months?|weeks?|days?|quarters?|periods?|semesters?)\b/gi;
const UNIT: Record<string, string> = { yr: "year", yrs: "year" };
const MAX_LISTED = 6;

function spans(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of text.matchAll(SPAN)) {
    const unit = match[2].toLowerCase().replace(/s$/, "");
    const key = `${Number(match[1])} ${UNIT[unit] ?? unit}`;
    if (!found.has(key)) found.set(key, `${match[1]} ${Number(match[1]) === 1 ? unit : `${unit}s`}`);
  }
  return found;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30 };
/** Per-year conversions a solution applies without saying so: semiannual, quarterly, monthly. */
const CONVERSIONS = [2, 4, 12];

/** Numbers the question states at all, however they are written ("T=20", "20-year", "three-year"). */
function numbersIn(text: string): number[] {
  const digits = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  const words = (text.toLowerCase().match(/[a-z]+/g) ?? []).flatMap((w) => (w in NUMBER_WORDS ? [NUMBER_WORDS[w]] : []));
  return [...new Set([...digits, ...words])];
}

/** Values one step of arithmetic away from the question's own numbers: "13 years" from "20 years… in 7 years". */
function derivable(given: number[]): Set<number> {
  const reach = new Set(given);
  for (const a of given) {
    for (const b of given) {
      for (const value of [a + b, a - b, a * b, b !== 0 ? a / b : NaN]) if (Number.isFinite(value)) reach.add(Math.round(value * 1e6) / 1e6);
    }
  }
  for (const value of [...reach]) for (const factor of CONVERSIONS) reach.add(Math.round(value * factor * 1e6) / 1e6).add(Math.round((value / factor) * 1e6) / 1e6);
  return reach;
}

/**
 * Time frames the solution works with that the question never gives, e.g. ["20 years"].
 * Empty when nothing looks missing. A time frame is reported only when its number is neither
 * in the question (or `context`, such as the example's name) nor one step of arithmetic from
 * numbers that are, so a derived "13 years" (20 minus 7) is not mistaken for a missing given.
 */
export function missingDetails(question: string, solution: string, context = ""): string[] {
  // A question that asks "how long" or "how many years" is asking for the time frame.
  if (/\bhow (long|many (years|months|periods|days))\b|\bsolve for (n|t)\b|\bpayback\b/i.test(question)) return [];
  // An example's name helps ("Repeating Three-Year Pattern") but its label does not: the
  // "1" and "2" of "T1 L2 - …" are not numbers in the problem.
  const title = context.includes(" - ") ? context.slice(context.indexOf(" - ") + 3) : context.replace(/\b[A-Za-z]{1,5}-?\d+\b/g, " ");
  const known = derivable(numbersIn(`${question} ${title}`));
  const questionSpans = spans(question);
  const missing: string[] = [];
  for (const [key, label] of spans(solution)) {
    const value = Number(key.split(" ")[0]);
    if (!questionSpans.has(key) && !known.has(value)) missing.push(label);
  }
  return missing.slice(0, MAX_LISTED);
}
