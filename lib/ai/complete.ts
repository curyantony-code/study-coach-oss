// One-shot (non-streaming) AI calls, for jobs that need the whole answer before acting on
// it: grading an explanation, drafting cards. Same provider order as the rest of the app.
import Anthropic from "@anthropic-ai/sdk";
import { client, cloudRequest, hasApiKey, MODEL, ollamaClient } from "@/lib/claude";
import { smallLocalModel } from "./local-models";
import { DEFAULT_CLOUD_MODEL_ID } from "@/lib/model-policy";
import { describeClaudeError, hasClaude, MODEL_MAIN } from "./claude-tutor";
import { needOwnKey } from "@/lib/ai/keys";

const MAX_OUTPUT_TOKENS = 16000;
const REQUEST_TIMEOUT_MS = 150_000;

export type Completion = { ok: true; text: string } | { ok: false; error: string };

async function viaClaude(system: string, user: string): Promise<Completion> {
  try {
    const anthropic = new Anthropic();
    const message = await anthropic.beta.messages.create({
      model: MODEL_MAIN,
      max_tokens: MAX_OUTPUT_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: user }],
    });
    if (message.stop_reason === "refusal") return { ok: false, error: "The AI declined that request." };
    const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    return text.trim() ? { ok: true, text } : { ok: false, error: "The AI returned an empty answer." };
  } catch (error) {
    console.error("Claude request failed", error);
    return { ok: false, error: describeClaudeError(error) };
  }
}

async function viaOpenAiCompatible(system: string, user: string, model: string, local: boolean): Promise<Completion> {
  const api = local ? ollamaClient : client;
  // On the free default this prefers general-purpose free models and keeps reasoning short.
  const request = local ? { model } : await cloudRequest(model);
  const response = await api.chat.completions.create(
    { ...request, messages: [{ role: "system", content: system }, { role: "user", content: user }] },
    { timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 }
  );
  const text = response.choices[0]?.message?.content ?? "";
  return text.trim() ? { ok: true, text } : { ok: false, error: "The AI returned an empty answer." };
}

/** Claude when its key is set; otherwise the configured OpenRouter model, the free router, then a small local model. */
export async function completeText(system: string, user: string): Promise<Completion> {
  if (hasClaude()) return viaClaude(system, user);
  const attempts: { model: string; local: boolean }[] = [
    ...(hasApiKey() ? [...new Set([MODEL, DEFAULT_CLOUD_MODEL_ID])].map((model) => ({ model, local: false })) : []),
  ];
  // Offline fallback: a small model on this computer, if one is installed. Never a large one.
  const local = await smallLocalModel();
  if (local) attempts.push({ model: local, local: true });
  for (const attempt of attempts) {
    try {
      const result = await viaOpenAiCompatible(system, user, attempt.model, attempt.local);
      if (result.ok) return result;
    } catch (error) {
      console.error(`AI request to ${attempt.model} failed`, error);
    }
  }
  return { ok: false, error: needOwnKey("ANTHROPIC_API_KEY or OPENROUTER_API_KEY") };
}
