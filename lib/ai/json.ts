// AI models asked for JSON often wrap it in prose, and break it when the content has LaTeX:
// "\sigma" is not a legal JSON escape, and "\beta" silently becomes a backspace plus "eta".

/** LaTeX commands starting with "n": the only letter where a real escape (a new line) is common too. */
const N_COMMANDS = /^(nu|ne|neq|neg|nabla|not|notin|ni|nolimits|nmid|nleq|ngeq|nless|ngtr|nexists|nsubseteq|nparallel|nrightarrow)(?![a-zA-Z])/;

/** Doubles the backslashes that belong to LaTeX, leaving real JSON escapes alone. */
export function escapeLatexBackslashes(json: string): string {
  return json.replace(/\\(\\|[^\\])/g, (match, next: string, offset: number) => {
    if (next === "\\" || next === '"' || next === "/") return match;
    const rest = json.slice(offset + 1, offset + 24);
    if (next === "u" && /^u[0-9a-fA-F]{4}/.test(rest)) return match;
    const startsWord = /^[a-zA-Z]{2}/.test(rest);
    // Tabs, backspaces, form feeds and bare carriage returns do not occur in questions: before a
    // word they are \tau, \beta, \frac, \rho. A new line before a word is usually just a new line.
    if ("tbfr".includes(next) && !startsWord) return match;
    if (next === "n" && !N_COMMANDS.test(rest)) return match;
    return `\\\\${next}`;
  });
}

const MAX_STARTS = 40;

/**
 * Places a model's reply might hold its array. Models that think out loud put the real array
 * last, after prose that may itself contain brackets, so later starts are tried first.
 */
function candidates(text: string): string[] {
  const end = text.lastIndexOf("]");
  if (end === -1) return [];
  const objectStarts = [...text.matchAll(/\[\s*\{/g)].map((m) => m.index).filter((at) => at < end).reverse().slice(0, MAX_STARTS);
  const first = text.indexOf("[");
  const starts = [...objectStarts, ...(first !== -1 && first < end ? [first] : [])];
  return [...new Set(starts)].map((at) => text.slice(at, end + 1));
}

/** The JSON array in a model's reply, or [] when there is none it can read. */
export function parseAiJsonArray(text: string): unknown[] {
  for (const span of candidates(text)) {
    for (const candidate of [escapeLatexBackslashes(span), span]) {
      try {
        const parsed: unknown = JSON.parse(candidate);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Try the next reading.
      }
    }
  }
  return [];
}
