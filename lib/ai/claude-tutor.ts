// The Claude path for the tutor, through the official Anthropic SDK.
// Ollama and OpenRouter stay in lib/claude.ts (they speak a different API).
import Anthropic from "@anthropic-ai/sdk";
import { checkOwnKey } from "@/lib/ai/keys";

/** Model ids come from the environment so they can change without a code edit. */
export const MODEL_MAIN = process.env.MODEL_MAIN || "claude-opus-5-5";
export const MODEL_FAST = process.env.MODEL_FAST || "claude-haiku-5-5";

const MAX_OUTPUT_TOKENS = 64000;
const REFUSAL_MESSAGE = "The AI declined to answer that. Try rephrasing the question around your course material.";

export function hasClaude(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function isClaudeModel(model: string | undefined | null): boolean {
  return typeof model === "string" && model.startsWith("claude-");
}

let cachedClient: Anthropic | null = null;
function client(): Anthropic {
  cachedClient ??= new Anthropic();
  return cachedClient;
}

export interface TutorTurn {
  role: "user" | "assistant";
  content: string;
}

/** Thrown when Claude cannot be reached at all, so the caller can fall back to a local model. */
export class ClaudeUnreachableError extends Error {}

/** Turns an SDK error into a sentence a student can act on. */
export function describeClaudeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return `The Anthropic API key was not accepted. ${checkOwnKey("ANTHROPIC_API_KEY")}`;
  if (error instanceof Anthropic.PermissionDeniedError) return "This Anthropic API key is not allowed to use that model.";
  if (error instanceof Anthropic.NotFoundError) return `The model "${MODEL_MAIN}" was not found. ${checkOwnKey("MODEL_MAIN")}`;
  if (error instanceof Anthropic.RateLimitError) return "The AI is rate-limited right now. Wait a minute and try again.";
  if (error instanceof Anthropic.APIConnectionError) return "Could not reach the AI service. Check your internet connection.";
  if (error instanceof Anthropic.APIError) return `The AI service returned an error (${error.status ?? "unknown"}). Try again shortly.`;
  return "Something went wrong while asking the AI.";
}

/**
 * Streams a tutor reply as plain text. The stream ends with the `\n__USAGE__<tokens>`
 * marker the chat page already understands. The system prompt is cached, since it
 * carries the course notes and repeats on every turn of a conversation.
 */
export async function streamClaudeTutor(
  system: string,
  turns: TutorTurn[],
  model: string = MODEL_MAIN,
  signal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const stream = client().beta.messages.stream({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    betas: ["server-side-fallback-2026-07-01"],
    // If a safety check declines the request, the API retries it on a recommended model.
    fallbacks: "default",
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: turns.map((t) => ({ role: t.role, content: t.content })),
  });
  // Stop generating (and paying) as soon as the student leaves or presses stop.
  signal?.addEventListener("abort", () => stream.abort(), { once: true });

  // Surface connection and key problems before any text is sent to the browser.
  try {
    await stream.withResponse();
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionError) throw new ClaudeUnreachableError(describeClaudeError(error));
    throw error;
  }

  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
      stream.abort();
    },
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(encoder.encode(`\n\n*${REFUSAL_MESSAGE}*`));
        if (final.stop_reason === "max_tokens") controller.enqueue(encoder.encode("\n\n*(The answer was cut off for length. Ask me to continue.)*"));
        const { usage } = final;
        const tokens = usage.input_tokens + usage.output_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
        controller.enqueue(encoder.encode(`\n__USAGE__${tokens}`));
      } catch (error) {
        if (cancelled || signal?.aborted) return;
        console.error("Claude stream failed", error);
        controller.enqueue(encoder.encode(`\n\n*${describeClaudeError(error)}*`));
      } finally {
        if (!cancelled) controller.close();
      }
    },
  });
}
