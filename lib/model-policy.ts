/**
 * OpenRouter's free router: it sends each request to whichever free model is available,
 * so the app keeps working when an individual free model is withdrawn.
 */
export const DEFAULT_CLOUD_MODEL_ID = "openrouter/free";

export interface CloudModelLike {
  id: string;
  label: string;
}

export interface PickAutoModelArgs {
  dailyTokens: number;
  dailyLimit: number;
  ollamaModels: string[];
  cloudModels: CloudModelLike[];
}

export interface PickAutoModelResult {
  id: string;
  reason: string;
}

/**
 * Picks a model based on local daily token budget (not OpenRouter account limits).
 * Prefers Ollama when usage is high; otherwise free-tier cloud; else default.
 */
export function pickAutoModel({
  dailyTokens,
  dailyLimit,
  ollamaModels,
  cloudModels,
}: PickAutoModelArgs): PickAutoModelResult {
  const limit = Math.max(1, dailyLimit);
  const ratio = dailyTokens / limit;

  if (ollamaModels.length > 0 && ratio >= 0.5) {
    return {
      id: ollamaModels[0],
      reason: "High daily usage — preferring local Ollama to save cloud quota.",
    };
  }

  if (ratio >= 0.7) {
    const free = cloudModels.find((m) => m.label.toLowerCase().includes("free"));
    if (free) {
      return {
        id: free.id,
        reason: "High daily usage — preferring a free-tier cloud model.",
      };
    }
  }

  if (cloudModels.length > 0) {
    return {
      id: cloudModels[0].id,
      reason: "Using the first available cloud model.",
    };
  }

  if (ollamaModels.length > 0) {
    return {
      id: ollamaModels[0],
      reason: "Using local Ollama.",
    };
  }

  return {
    id: DEFAULT_CLOUD_MODEL_ID,
    reason: "Default free model (configure API key or Ollama).",
  };
}
