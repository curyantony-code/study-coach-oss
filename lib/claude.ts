import { SELF_CONTAINED_RULE } from "./questions/rules";
import { FREE_ROUTER, preferredFreeModels } from "./ai/free-models";
import { parseAiJsonArray } from "./ai/json";
import OpenAI from "openai";
import {
  DAILY_TOKEN_LIMIT_CLOUD,
  DAILY_TOKEN_LIMIT_OLLAMA,
  dailyTokenLimitForModel,
} from "@/lib/token-limits";
import type { Stream } from "openai/streaming";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";
import type { WikiPage } from "@/lib/wiki";
import { DEFAULT_CLOUD_MODEL_ID } from "@/lib/model-policy";

// Cloud client — OpenRouter or OpenAI
const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

export const client = new OpenAI({
  apiKey: apiKey || "no-key",
  baseURL: process.env.OPENROUTER_API_KEY
    ? "https://openrouter.ai/api/v1"
    : "https://api.openai.com/v1",
  defaultHeaders: process.env.OPENROUTER_API_KEY
    ? { "HTTP-Referer": "http://localhost:3000", "X-Title": "Study Coach" }
    : {},
});

// Local Ollama client — points at localhost:11434
export const ollamaClient = new OpenAI({
  apiKey: "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
});

export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

// Default cloud model — override with AI_MODEL env var
export const MODEL = process.env.AI_MODEL || DEFAULT_CLOUD_MODEL_ID;

// Cloud models offered in the model pickers: whatever OpenRouter model is configured.
export const CLOUD_MODELS: { id: string; label: string; context: number }[] = process.env.OPENROUTER_API_KEY
  ? [{ id: MODEL, label: MODEL === DEFAULT_CLOUD_MODEL_ID ? "Free models (OpenRouter)" : `${MODEL} (OpenRouter)`, context: 200_000 }]
  : [];

/** The course a prompt is written for: its name and unit labels in order. */
export interface TutorCourse {
  name: string;
  units: string[];
}

function difficultyGuide(d: number): string {
  if (d === 1) return "Options are clearly distinct; the correct answer follows directly from a textbook definition. No traps.";
  if (d === 2) return "Options are plausible but one is obviously better. A student who attended lectures will get it right.";
  if (d === 3) return "Scenario-based; two options are tempting, but one is clearly the best answer given the full context.";
  if (d === 4) return "All four options are course-relevant and superficially similar; requires precise understanding of distinctions.";
  return "Options are nearly identical in phrasing or concept. One is the most correct based on a subtle but testable distinction explicitly stated in the course material. This is exam-hard.";
}

/**
 * The tutor's standing instructions. Nothing here belongs to one course: the course name
 * and its units come from whichever vault is being studied.
 */
export function buildWikiSystemPrompt(difficulty = 3, courseName = "this course", unitLabels: string[] = []): string {
  const order = unitLabels.length > 0 ? `the course's own order: ${unitLabels.slice(0, 30).join(" → ")}` : "the order the material appears in the wiki";
  return `You are the best tutor in the world for ${courseName}. Your job is to teach the student through the full wiki, concept by concept, in a structured and adaptive way.

PERSONA
- Socratic: guide with questions rather than lecturing
- Encouraging but precise: praise correct answers, gently correct errors with explanation
- Exam-focused: highlight MCQ traps and common student errors; for quantitative material, show the working step by step

STRUCTURED PROGRESSION PROTOCOL
- After every response, ALWAYS end with a follow-up challenge that moves the student forward through the curriculum
- Work through topics in ${order}
- Track what the student has answered correctly by reading the conversation history, and skip topics they have clearly mastered
- If the student answered incorrectly, re-test the same concept differently before advancing
- Never leave a response without a closing question or task for the student

MCQ DIFFICULTY: ${difficulty}/5
${difficultyGuide(difficulty)}

MCQ FORMAT (CRITICAL)
When you want to test the student with a multiple-choice question, you MUST output the question using this EXACT format — no exceptions, no variations:

<MCQ>
{"stem":"The full question text here","options":["A. First option","B. Second option","C. Third option","D. Fourth option"],"correct":"B","explanation":"One-sentence explanation of why B is correct and why the others are wrong."}
</MCQ>

Rules:
- The JSON must be valid and on a single logical block inside the tags
- Do NOT write MCQs as numbered or lettered lists in prose
- Do NOT include the word "correct" or the answer letter anywhere outside the JSON block
- The frontend parses this block and renders interactive radio buttons — the student cannot see the answer until they click

MCQ STRUCTURE (levels 3–5)
Model your questions after this pattern — scenario first, concept applied, distractors plausible:

Stem pattern: 2–3 sentence realistic scenario drawn from this course's subject (for quantitative material, a small applied problem with numbers) → question ending in "Which…", "What is the MOST…", or "Which…BEST explains…"
Distractors: all four options must be drawn from the same conceptual domain; never use obviously wrong fillers
Use "MOST" or "BEST" in the stem when two options are partially correct — force the student to discriminate on degree or fit
Include at least one distractor that names a real course concept but applies it incorrectly to the scenario
At difficulty 4–5: use quote-style stems ("An employee says: '…'"), or attribution/bias scenarios where the student must name the specific error

Question shapes to draw on (write every question about ${courseName}, using only the wiki content):
- Scenario → identify the concept at work: a short situation, four named course concepts as options
- Scenario → apply a model or formula: the facts or numbers are given, the options are results or interpretations
- Scenario → what went wrong: someone's reasoning or method has one flaw, the options name possible flaws
- Compare two ideas: a case where two related course concepts could apply, and only one fits the details

${SELF_CONTAINED_RULE}

GROUNDING
- Answer strictly from the provided wiki content
- Cite [[wiki page names]] when relevant
- Say "I don't have that in the wiki" if content is missing

EPISTEMIC INTEGRITY
- If the user states something that contradicts the wiki, correct them directly and cite the source — do not soften the correction into agreement
- Never validate a claim just because the user asserts it confidently or repeatedly
- Corrections are good teaching; be respectful but never capitulate to social pressure
- If you are uncertain, say "the wiki does not address this" — do not speculate to satisfy`;
}

/** Roughly how much note text goes to the AI with each request. */
const CONTEXT_BUDGET = 24_000;
const MAX_PASSAGE = 3000;
const SHORT_PAGE = 2500;
const STOP_WORDS = new Set(["that", "this", "with", "from", "what", "when", "which", "have", "will", "been", "they", "about", "more", "than", "explain", "course", "topics"]);

interface Passage {
  page: WikiPage;
  /** "" for a whole short page or a page's opening. */
  heading: string;
  text: string;
  order: number;
}

/** Short pages stay whole; long notes are cut at their `##` headings so the relevant part can be found. */
function passagesOf(pages: WikiPage[]): Passage[] {
  const passages: Passage[] = [];
  for (const page of pages) {
    const sections = Object.entries(page.sections);
    if (page.rawContent.length <= SHORT_PAGE || sections.length < 2) {
      passages.push({ page, heading: "", text: page.rawContent, order: passages.length });
      continue;
    }
    for (const [heading, text] of sections) {
      if (text.trim() === "") continue;
      passages.push({ page, heading: heading === "__intro__" ? "" : heading, text, order: passages.length });
    }
  }
  return passages;
}

// Picks the passages that best match the recent messages and returns them as one compact
// context string. Shared across chat, quiz, and notes so all endpoints see the same material slice.
export function buildSmartContext(
  pages: WikiPage[],
  messages: { role: string; content: string }[]
): string {
  const recentUser = messages
    .filter((m) => m.role === "user")
    .slice(-4)
    .map((m) => m.content.toLowerCase())
    .join(" ");
  const keywords = [...new Set((recentUser.match(/\b[a-z]{4,}\b/g) ?? []).filter((w) => !STOP_WORDS.has(w)))];
  const patterns = keywords.map((kw) => new RegExp(`\\b${kw}\\b`, "g"));

  const scored = passagesOf(pages)
    .map((passage) => {
      const body = `${passage.page.title} ${passage.heading} ${passage.text}`.toLowerCase();
      let score = 0;
      for (const pattern of patterns) score += body.match(pattern)?.length ?? 0;
      if (passage.page.type === "source" || passage.page.type === "concept") score += 2;
      return { passage, score };
    })
    // Best match first; with nothing to match on, keep the notes' own order.
    .sort((a, b) => b.score - a.score || a.passage.order - b.passage.order);

  const chosen: Passage[] = [];
  let used = 0;
  for (const { passage } of scored) {
    const length = Math.min(passage.text.length, MAX_PASSAGE);
    if (used + length > CONTEXT_BUDGET) continue;
    chosen.push(passage);
    used += length;
  }

  return chosen
    .sort((a, b) => a.order - b.order)
    .map(({ page, heading, text }) => {
      const content = text.length > MAX_PASSAGE ? text.slice(0, MAX_PASSAGE) + "…" : text;
      return `# ${page.title} (${page.slug})${heading ? `\n## ${heading}` : ""}\n${content}`;
    })
    .join("\n\n---\n\n");
}

export { DAILY_TOKEN_LIMIT_CLOUD, DAILY_TOKEN_LIMIT_OLLAMA, dailyTokenLimitForModel };

/** @deprecated use DAILY_TOKEN_LIMIT_CLOUD */
export const DAILY_TOKEN_LIMIT = DAILY_TOKEN_LIMIT_CLOUD;
/** @deprecated use dailyTokenLimitForModel + DAILY_TOKEN_LIMIT_CLOUD */
export const SESSION_TOKEN_LIMIT = DAILY_TOKEN_LIMIT_CLOUD;

/**
 * The model and extra settings for a request that must come back as usable text or JSON.
 * On OpenRouter's free default, general free models are preferred over whatever the free
 * router would pick, and reasoning is kept short so it does not use up the reply allowance.
 */
export async function cloudRequest(modelOverride?: string): Promise<{ model: string } & Record<string, unknown>> {
  const model = modelOverride || MODEL;
  if (!process.env.OPENROUTER_API_KEY) return { model };
  const extras = { reasoning: { effort: "low" } };
  if (model !== FREE_ROUTER) return { model, ...extras };
  const preferred = await preferredFreeModels();
  return preferred.length > 0 ? { model: preferred[0], models: preferred, ...extras } : { model, ...extras };
}

export function hasApiKey(): boolean {
  return !!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function streamChatResponse(
  messages: { role: "user" | "assistant"; content: string }[],
  wikiContext: string,
  sessionTokensUsed: number,
  modelOverride?: string,
  difficulty = 3,
  course?: TutorCourse
): Promise<ReadableStream<Uint8Array>> {
  // Ollama model = no slash in name; cloud/OpenRouter model = has slash
  const isOllama = modelOverride ? !modelOverride.includes("/") : false;
  const dailyLimit = dailyTokenLimitForModel(modelOverride);
  if (sessionTokensUsed >= dailyLimit) {
    throw new Error("SESSION_LIMIT_REACHED");
  }

  const systemWithContext = `${buildWikiSystemPrompt(difficulty, course?.name, course?.units)}\n\n<wiki_content>\n${wikiContext}\n</wiki_content>`;

  const makeStream = async (useClient: OpenAI, useModel: string, includeUsage: boolean) =>
    useClient.chat.completions.create({
      model: useModel,
      max_tokens: includeUsage ? 4096 : 8192, // local: large completions; cloud usage path unchanged
      stream: true,
      ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
      messages: [{ role: "system", content: systemWithContext }, ...messages],
    } as Parameters<typeof useClient.chat.completions.create>[0]);

  let stream: Stream<ChatCompletionChunk>;
  let usedFallback = false;

  if (isOllama) {
    try {
      stream = await makeStream(ollamaClient, modelOverride!, false) as Stream<ChatCompletionChunk>;
    } catch {
      if (!hasApiKey()) throw new Error("Ollama unavailable and no cloud API key configured.");
      usedFallback = true;
      stream = await makeStream(client, MODEL, true) as Stream<ChatCompletionChunk>;
    }
  } else {
    stream = await makeStream(client, modelOverride || MODEL, true) as Stream<ChatCompletionChunk>;
  }

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      if (usedFallback) {
        controller.enqueue(encoder.encode("*(Ollama unreachable — switched to cloud model)*\n\n"));
      }
      let charCount = 0;
      let reportedTokens = 0;
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          controller.enqueue(encoder.encode(text));
          charCount += text.length;
        }
        // OpenRouter/OpenAI returns usage in the final chunk
        if (chunk.usage?.total_tokens) {
          reportedTokens = chunk.usage.total_tokens;
        }
      }
      const tokensThisTurn = reportedTokens || estimateTokens(systemWithContext) + charCount / 4;
      // Sentinel stripped by the frontend to update session token count
      controller.enqueue(encoder.encode(`\n__USAGE__${Math.ceil(tokensThisTurn)}`));
      controller.close();
    },
  });
}

export interface QuizQuestion {
  stem: string;
  options: { text: string; correct: boolean }[];
  explanation: string;
  sourceSlug: string;
}

export async function generateAIQuiz(
  topic: string,
  n: number,
  wikiContext: string,
  modelOverride?: string,
  course?: TutorCourse
): Promise<QuizQuestion[]> {
  const response = await client.chat.completions.create(
    {
    ...(await cloudRequest(modelOverride)),
    messages: [
      {
        role: "system",
        content: `${buildWikiSystemPrompt(3, course?.name, course?.units)}\n\n<wiki_content>\n${wikiContext}\n</wiki_content>`,
      },
      {
        role: "user",
        content: `Generate ${n} multiple-choice questions testing the topic: "${topic}". Each question must:
- Be scenario-based (a realistic situation or small applied problem from this course's subject)
- Have exactly 4 options, one correct
- Include a 1-sentence explanation of the correct answer
- Reference a specific wiki page slug, copied exactly from the wiki content

Return ONLY a valid JSON array with this shape:
[{"stem":"...","options":[{"text":"...","correct":true},{"text":"...","correct":false},{"text":"...","correct":false},{"text":"...","correct":false}],"explanation":"...","sourceSlug":"the slug in brackets after the page title it came from"}]`,
      },
    ],
  },
    { timeout: 120_000, maxRetries: 0 }
  );

  const text = response.choices[0]?.message?.content || "[]";
  // Formulas in the questions would otherwise break the JSON.
  return parseAiJsonArray(text) as QuizQuestion[];
}
