import { client, cloudRequest, hasApiKey } from "../claude";
import type { Card } from "../vault/types";
import { parseAiJsonArray } from "./json";
import { examplesFrom, pickExamples, readVariants, variantSystemPrompt, variantUserPrompt, type VariantQuestion } from "./variants";

/** Small batches: a free model asked for many questions at once often returns none. */
const BATCH_SIZE = 3;
const MAX_BATCHES = 8;
const TRIES = 1;
const REQUEST_TIMEOUT_MS = 150_000;

/**
 * Writes up to `count` new questions, each modelled on one of the worked examples among
 * `cards`. Returns fewer (possibly none) when the AI is unavailable or its replies are unusable.
 */
export async function generateVariantQuiz(cards: Card[], slugOf: (nodeId: string) => string, courseName: string, count: number, model?: string): Promise<VariantQuestion[]> {
  if (!hasApiKey() || count <= 0) return [];
  const problems = cards.filter((c) => c.type === "problem");
  if (problems.length === 0) return [];
  // With fewer examples than questions wanted, examples are used again: the numbers will differ.
  const rounds = Math.min(Math.ceil(count / problems.length), 3);
  const chosen = Array.from({ length: rounds }, () => pickExamples(problems, count)).flat().slice(0, Math.min(count, BATCH_SIZE * MAX_BATCHES));
  const byId = new Map(examplesFrom(chosen).map((e) => [e.cardId, e]));
  const examples = chosen.flatMap((card) => {
    const example = byId.get(card.id);
    return example ? [{ ...example, sourceSlug: slugOf(card.nodeId) }] : [];
  });
  const batches = Array.from({ length: Math.ceil(examples.length / BATCH_SIZE) }, (_, i) => examples.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE));
  const system = variantSystemPrompt(courseName);
  const request = await cloudRequest(model);

  const results = await Promise.all(
    batches.map(async (batch) => {
      let best: VariantQuestion[] = [];
      for (let attempt = 0; attempt < TRIES && best.length < batch.length; attempt++) {
        try {
          const response = await client.chat.completions.create(
            {
              // No reply-length cap: models that reason first need the room to reach the answer.
              ...request,
              messages: [
                { role: "system", content: system },
                { role: "user", content: variantUserPrompt(batch) + (attempt > 0 ? "\n\nYour previous reply could not be used. Reply with the complete, valid JSON array only." : "") },
              ],
            },
            // A slow model must not hold the whole quiz up: give up on this try and move on.
            { timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 }
          );
          const read = readVariants(parseAiJsonArray(response.choices[0]?.message?.content || ""), batch);
          if (read.length > best.length) best = read;
        } catch (error) {
          // One failed batch should not sink the quiz.
          console.error("Variant questions request failed", error);
        }
      }
      return best;
    })
  );
  return results.flat().slice(0, count);
}
