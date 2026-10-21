// "Ask AI about this highlight" in the Library and in study sessions: the free cloud models
// stream a short explanation grounded in the note the student is reading.
import { client, cloudRequest, hasApiKey, ollamaClient } from "@/lib/claude";
import { smallLocalModel } from "./local-models";
import { DEFAULT_CLOUD_MODEL_ID } from "@/lib/model-policy";
import type { TutorTurn } from "./claude-tutor";

export const MAX_SELECTION_LENGTH = 4000;
export const MAX_QUESTION_LENGTH = 600;
export const MAX_TURNS = 12;

export type ExplainProvider = "claude" | "cloud" | "local";

/** Which AI will answer, so the page can say where the highlighted text is sent. Ask AI uses the free cloud models. */
export function explainProvider(): ExplainProvider {
  return hasApiKey() ? "cloud" : "local";
}

export const PROVIDER_LABEL: Record<ExplainProvider, string> = {
  claude: "Claude (Anthropic)",
  cloud: "free AI models (through OpenRouter)",
  local: "the AI running on this computer (Ollama)",
};

export function explainSystemPrompt(courseName: string, noteTitle: string, noteBody: string): string {
  return `You help a student understand a passage they highlighted while reading their own course notes for ${courseName}.

How to answer:
- Explain the highlighted passage in plain language first, then add the detail that makes it click: what each symbol or term means, why it is true, and a small concrete example when it helps.
- Stay consistent with the note below. It is the course's own material: use its notation and definitions. If the note does not cover what is asked, say so and answer from general knowledge, clearly marked as such.
- Be brief: a few short paragraphs or a short list. No preamble, no restating the question.
- Write maths in LaTeX with dollar signs ($x^2$ inline, $$...$$ on its own line). Write a literal dollar amount as \\$5.
- The student is studying for an exam. Do not ask them a question back unless they ask to be quizzed.

<note title="${noteTitle.replace(/"/g, "'")}">
${noteBody}
</note>`;
}

export function firstTurn(selection: string, question: string): string {
  const ask = question.trim() || "Explain this so it makes sense to me.";
  return `I highlighted this in the note:\n\n<highlight>\n${selection.trim()}\n</highlight>\n\n${ask}`;
}

async function streamOpenAiCompatible(system: string, turns: TutorTurn[], request: { model: string } & Record<string, unknown>, local = false): Promise<ReadableStream<Uint8Array>> {
  const api = local ? ollamaClient : client;
  const stream = await api.chat.completions.create({
    ...request,
    stream: true,
    messages: [{ role: "system", content: system }, ...turns],
  } as Parameters<typeof api.chat.completions.create>[0] & { stream: true });
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    cancel() {
      stream.controller.abort();
    },
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch (error) {
        console.error("Explain stream failed", error);
        controller.enqueue(encoder.encode("\n\n*The answer was interrupted. Try asking again.*"));
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a cancel from the browser.
        }
      }
    },
  });
}

export type ExplainResult = { ok: true; stream: ReadableStream<Uint8Array> } | { ok: false; error: string; status: number };

/**
 * "Ask AI" is answered by the free cloud models, whatever else is configured: the owner wants
 * these everyday questions to cost nothing. If the cloud cannot be reached, a small model on
 * this computer answers, when one is installed.
 */
export async function streamExplanation(system: string, turns: TutorTurn[]): Promise<ExplainResult> {
  let cloudRejected = false;
  if (hasApiKey()) {
    try {
      // The free router, steered toward general-purpose free models.
      return { ok: true, stream: await streamOpenAiCompatible(system, turns, await cloudRequest(DEFAULT_CLOUD_MODEL_ID)) };
    } catch (error) {
      console.error("Explain request to the free cloud models failed", error);
      cloudRejected = true;
    }
  }
  const local = await smallLocalModel();
  if (local) {
    try {
      return { ok: true, stream: await streamOpenAiCompatible(system, turns, { model: local }, true) };
    } catch (error) {
      console.error(`Explain request to the local model ${local} failed`, error);
    }
  }
  return {
    ok: false,
    status: 503,
    error: cloudRejected
      ? "The free AI models did not answer just now. Try again in a moment."
      : "No AI is set up. Add OPENROUTER_API_KEY to the app's settings, then restart Study Coach.",
  };
}
