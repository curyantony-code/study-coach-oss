/** Cloud / OpenRouter daily budget (client + server). */
export const DAILY_TOKEN_LIMIT_CLOUD = 200_000;

/** Local Ollama — no vendor quota; allow long sessions and large diagnostics. */
export const DAILY_TOKEN_LIMIT_OLLAMA = 2_000_000;

/** Local Ollama model ids have no `/` (OpenRouter ids look like `org/model`) and are not Claude ids. */
export function isLocalModel(modelId: string | undefined | null): boolean {
  return Boolean(modelId) && !modelId!.includes("/") && !modelId!.startsWith("claude-");
}

export function dailyTokenLimitForModel(modelId: string | undefined): number {
  if (isLocalModel(modelId)) return DAILY_TOKEN_LIMIT_OLLAMA;
  return DAILY_TOKEN_LIMIT_CLOUD;
}
