// Study Coach never comes with an AI key: each person adds their own, and AI features stay
// off until they do. These sentences tell them where the key goes.

/** Where a key is added. */
export const WHERE_KEYS_GO = "the Set up AI page (Settings → Set up AI)";

/** Shown when an AI feature is used before any key or local model is set up. */
export function needOwnKey(keys: string): string {
  return `This needs your own AI key (${keys}). Open Settings → Set up AI: there is a free option that takes about 3 minutes.`;
}

/** Shown when a key that was added is wrong or out of credit. */
export function checkOwnKey(key: string): string {
  return `Check ${key} on ${WHERE_KEYS_GO}.`;
}
