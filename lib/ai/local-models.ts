// Small models that run on this computer through Ollama: free, private and quick. They do the
// short, structured jobs (rewriting one question, writing a few quiz questions); code checks
// what they produce, and anything that fails the check goes to a larger free cloud model.

const DEFAULT_BASE = "http://localhost:11434/v1";
const CACHE_MS = 5 * 60 * 1000;
const LIST_TIMEOUT_MS = 1500;
/**
 * The owner's ceiling: a model that runs on this computer has at most 4 billion parameters.
 * Anything larger is never picked, whatever is installed.
 */
export const MAX_SMALL_PARAMETERS = 4e9;
/** A model that does not say how many parameters it has is only trusted when its file is this small. */
const MAX_UNSIZED_BYTES = 3e9;
/** Not general-purpose writers. */
const UNSUITABLE = /code|coder|embed|vision|guard|rerank/i;

export interface InstalledModel {
  name: string;
  /** Bytes on disk; 0 for cloud-hosted entries, which are not local. */
  size: number;
  /** e.g. "8.0B", "30.5B", "4.3B" */
  parameterSize?: string;
}

function parameters(model: InstalledModel): number | null {
  const match = model.parameterSize?.match(/^([\d.]+)\s*([BM])$/i);
  if (!match) return null;
  return Number(match[1]) * (match[2].toUpperCase() === "B" ? 1e9 : 1e6);
}

/** Installed models small enough to use, best guess first: the largest that is still small. */
export function rankSmallModels(models: InstalledModel[], preferred?: string): string[] {
  const small = models
    .filter((m) => m.size > 0 && !/-cloud$/i.test(m.name) && !UNSUITABLE.test(m.name))
    .filter((m) => {
      const count = parameters(m);
      return count === null ? m.size <= MAX_UNSIZED_BYTES : count <= MAX_SMALL_PARAMETERS;
    })
    .sort((a, b) => (parameters(b) ?? 0) - (parameters(a) ?? 0) || a.name.localeCompare(b.name))
    .map((m) => m.name);
  // A model the owner names is used first, but only if it passes the same size limit.
  return preferred && small.includes(preferred) ? [preferred, ...small.filter((name) => name !== preferred)] : small;
}

/** Models Ollama runs on its own servers ("…-cloud"): nothing is downloaded, and size does not matter here. */
export function cloudHosted(models: InstalledModel[]): string[] {
  return models.filter((m) => (m.size === 0 || /-cloud$/i.test(m.name)) && !UNSUITABLE.test(m.name)).map((m) => m.name).sort();
}

let cached: { at: number; model: string | null; cloud: string[] } | null = null;
/** Cloud models that answered with an error (retired, signed out): not tried again until restart. */
const unavailable = new Set<string>();

async function refresh(now: number, fetchFn: typeof fetch): Promise<NonNullable<typeof cached>> {
  if (cached && now - cached.at < CACHE_MS) return cached;
  const base = (process.env.OLLAMA_BASE_URL || DEFAULT_BASE).replace(/\/v1\/?$/, "");
  try {
    const response = await fetchFn(`${base}/api/tags`, { signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`ollama: ${response.status}`);
    const body = (await response.json()) as { models?: { name: string; size?: number; details?: { parameter_size?: string } }[] };
    const installed = (body.models ?? []).map((m) => ({ name: m.name, size: m.size ?? 0, parameterSize: m.details?.parameter_size }));
    cached = { at: now, model: rankSmallModels(installed, process.env.OLLAMA_SMALL_MODEL || process.env.OLLAMA_MODEL)[0] ?? null, cloud: cloudHosted(installed) };
  } catch {
    // Ollama not running is normal: the other cloud models are used instead.
    cached = { at: now, model: null, cloud: [] };
  }
  return cached;
}

/** The small local model to use, or null when Ollama is not running or has none installed. */
export async function smallLocalModel(now: number = Date.now(), fetchFn: typeof fetch = fetch): Promise<string | null> {
  return (await refresh(now, fetchFn)).model;
}

/** Ollama cloud models worth trying, in order. A model named in OLLAMA_CLOUD_MODEL goes first. */
export async function ollamaCloudModels(now: number = Date.now(), fetchFn: typeof fetch = fetch): Promise<string[]> {
  const usable = (await refresh(now, fetchFn)).cloud.filter((name) => !unavailable.has(name));
  const preferred = process.env.OLLAMA_CLOUD_MODEL;
  return preferred && usable.includes(preferred) ? [preferred, ...usable.filter((name) => name !== preferred)] : usable;
}

export function markCloudModelUnavailable(name: string): void {
  unavailable.add(name);
}
