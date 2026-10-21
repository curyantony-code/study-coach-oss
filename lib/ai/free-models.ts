// OpenRouter's "free" router picks any free model, including code, safety and audio models
// that return nothing useful for a question-writing request. When the app is on the free
// default, this asks OpenRouter which free models exist right now and prefers general ones.

const LIST_URL = "https://openrouter.ai/api/v1/models";
const CACHE_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
/** OpenRouter tries these in order when one is busy or fails. */
const MAX_FALLBACKS = 3;
export const FREE_ROUTER = "openrouter/free";

/** Not general-purpose writers. */
const UNSUITABLE = /safety|guard|code|coder|audio|lyria|clip|vision-only|embed|rerank|note-preview|nano|omni|mini|small|flash|-xs|lfm/i;
/** Larger general models first; the order is a preference, not a guarantee. */
const PREFERRED = [/gemma-\d+-3\d+b/i, /ultra/i, /super/i, /gemma/i, /llama/i, /qwen/i, /mistral/i, /deepseek/i, /nemotron/i];

interface ListedModel {
  id: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

/** Free, general-purpose models from a model list, best guess first. */
export function rankFreeModels(models: ListedModel[]): string[] {
  const rank = (id: string) => {
    const at = PREFERRED.findIndex((pattern) => pattern.test(id));
    return at === -1 ? PREFERRED.length : at;
  };
  return models
    .filter((m) => m.id !== FREE_ROUTER && (m.id.endsWith(":free") || (m.pricing?.prompt === "0" && m.pricing?.completion === "0")))
    .filter((m) => !UNSUITABLE.test(m.id) && (m.context_length ?? 0) >= 60_000)
    .sort((a, b) => rank(a.id) - rank(b.id) || (b.context_length ?? 0) - (a.context_length ?? 0))
    .map((m) => m.id);
}

let cached: { at: number; ids: string[] } | null = null;

/** Up to three free models to try, or [] when the list cannot be fetched (the router is used then). */
export async function preferredFreeModels(now: number = Date.now(), fetchFn: typeof fetch = fetch): Promise<string[]> {
  if (cached && now - cached.at < CACHE_MS) return cached.ids;
  try {
    const response = await fetchFn(LIST_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`model list: ${response.status}`);
    const body = (await response.json()) as { data?: ListedModel[] };
    cached = { at: now, ids: rankFreeModels(body.data ?? []).slice(0, MAX_FALLBACKS) };
  } catch (error) {
    console.error("Could not list OpenRouter's free models", error);
    // Try again in a few minutes rather than on every request.
    cached = { at: now - CACHE_MS + 5 * 60 * 1000, ids: [] };
  }
  return cached.ids;
}
