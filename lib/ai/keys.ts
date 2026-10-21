// Study Coach never comes with an AI key: each person adds their own, and AI features stay
// off until they do. These sentences tell them where the key goes.

/** Where a key is added, for both ways of running the app. */
export const WHERE_KEYS_GO =
  "the desktop app's settings.env file (Mac: ~/Library/Application Support/Study Coach, Windows: %APPDATA%\\Study Coach), or .env.local when running from source. See the README, \"AI features\"";

/** Shown when an AI feature is used before any key or local model is set up. */
export function needOwnKey(keys: string): string {
  return `This needs your own AI key. Add ${keys} to ${WHERE_KEYS_GO}. Then restart Study Coach. Or install a small local model with Ollama.`;
}

/** Shown when a key that was added is wrong or out of credit. */
export function checkOwnKey(key: string): string {
  return `Check ${key} in ${WHERE_KEYS_GO}.`;
}
