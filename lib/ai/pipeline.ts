// How Study Coach keeps AI work cheap. The shape is borrowed from the Laya project
// (github.com/aayushch/laya, Apache-2.0), which processes each event as
//   RULES (pure code) -> ROUTER (small fast model) -> STAGER (strong model).
//
// Here:
//   RULES   code decides what is wrong and what may be said (lib/questions/rules.ts).
//   ROUTER  a small model on this computer extracts a short, structured brief. It is quick,
//           free and private, and it never writes prose the student reads unchecked.
//   COMPOSE code builds the result from the brief, so a usable answer exists with no cloud call.
//   STAGER  a larger cloud model (the owner's Ollama cloud models first, then the free
//           OpenRouter ones) may then polish the wording. It sees only the composed
//           text, and code verifies that it changed no numbers before its version is used.
import { client, cloudRequest, hasApiKey, ollamaClient } from "../claude";
import { completeText } from "./complete";
import { markCloudModelUnavailable, ollamaCloudModels, smallLocalModel } from "./local-models";

const ROUTER_TIMEOUT_MS = 45_000;
const STAGER_TIMEOUT_MS = 150_000;

export type RouterVia = "small-local" | "cloud";

/**
 * Runs an extraction job on the small local model, falling back to the cloud when there is
 * none or its reply fails `check`. `check` is code: it returns the usable result or null.
 */
export async function route<T>(system: string, user: string, check: (text: string) => T | null, options: { localOnly?: boolean } = {}): Promise<{ ok: true; value: T; via: RouterVia } | { ok: false; error: string }> {
  const small = await smallLocalModel();
  if (small) {
    try {
      const response = await ollamaClient.chat.completions.create(
        { model: small, temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] },
        { timeout: ROUTER_TIMEOUT_MS, maxRetries: 0 }
      );
      const value = check(response.choices[0]?.message?.content ?? "");
      if (value !== null) return { ok: true, value, via: "small-local" };
    } catch (error) {
      console.error(`Small local model ${small} failed`, error);
    }
  }
  // Some jobs must stay on this computer when it has a model of its own.
  if (small && options.localOnly) return { ok: false, error: "The small model's reply did not pass the checks, so it was not used." };
  const reply = await completeText(system, user);
  if (!reply.ok) return reply;
  const value = check(reply.text);
  return value === null ? { ok: false, error: "The AI's reply did not pass the checks, so it was not used." } : { ok: true, value, via: "cloud" };
}

/**
 * True when polishing may be attempted: with a cloud key, or because Ollama may have a cloud
 * model signed in (found out when asked). Polishing is optional everywhere.
 */
export function canStage(): boolean {
  return hasApiKey() || process.env.OLLAMA_CLOUD !== "off";
}

/** Tries the owner's Ollama cloud models in turn. A model that errors (retired, signed out) is not asked again. */
async function stageWithOllamaCloud(system: string, user: string): Promise<string | null> {
  for (const model of await ollamaCloudModels()) {
    try {
      const response = await ollamaClient.chat.completions.create(
        { model, messages: [{ role: "system", content: system }, { role: "user", content: user }] },
        { timeout: STAGER_TIMEOUT_MS, maxRetries: 0 }
      );
      const text = response.choices[0]?.message?.content?.trim();
      if (text) return text;
    } catch (error) {
      console.error(`Ollama cloud model ${model} failed; not using it again this run`, error instanceof Error ? error.message : error);
      markCloudModelUnavailable(model);
    }
  }
  return null;
}

/** Asks the larger cloud model to polish text. Returns null on any failure: the caller already has a usable version. */
export async function stage(system: string, user: string): Promise<string | null> {
  if (!canStage()) return null;
  const viaOllama = await stageWithOllamaCloud(system, user);
  if (viaOllama) return viaOllama;
  if (!hasApiKey()) return null;
  try {
    const response = await client.chat.completions.create(
      { ...(await cloudRequest()), messages: [{ role: "system", content: system }, { role: "user", content: user }] },
      { timeout: STAGER_TIMEOUT_MS, maxRetries: 0 }
    );
    return response.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error("Polishing with the cloud model failed", error);
    return null;
  }
}
