import { NextRequest } from "next/server";
import { getAllPages } from "@/lib/wiki";
import { tutorCourse } from "@/lib/course";
import { getActiveContent } from "@/lib/vault/active";
import { client, MODEL, buildWikiSystemPrompt, buildSmartContext, hasApiKey } from "@/lib/claude";

const TIER_PROMPTS: Record<string, string> = {
  summary: `Create concise study notes (bullet points, key terms bolded). Focus on the most testable facts. 3–5 bullets per major concept. Max 400 words.`,
  detailed: `Create detailed study notes with headings, sub-bullets, and bolded key terms. Include definitions, examples, and exam tips. Max 700 words.`,
  comprehensive: `Create comprehensive study notes covering every concept, theory, model, and distinction covered in the material. Use headings, sub-headings, tables where useful, and bolded terms. Include common misconceptions and exam traps. Max 1200 words.`,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const topic = searchParams.get("topic") || "all";
  const tier  = searchParams.get("tier")  || "detailed";
  const model = searchParams.get("model") || MODEL;

  if (!hasApiKey()) {
    return new Response("No API key configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY.", { status: 503 });
  }

  const active = await getActiveContent();
  if (!active) return new Response("Add a vault first.", { status: 404 });
  const allPages = await getAllPages();
  // `topic` is one of the vault's unit ids, "all", or free text.
  const unit = active.index.units.find((u) => u.id === topic);
  const unitPages = unit ? allPages.filter((p) => p.sources.includes(unit.id)) : [];
  const pages = unitPages.length > 0 ? unitPages : allPages;
  const topicName = topic === "all" ? "all course topics" : unit?.label ?? topic;
  const course = tutorCourse(active.index);

  const wikiContent = buildSmartContext(pages, [{ role: "user", content: topicName }]);

  const tierPrompt = TIER_PROMPTS[tier] || TIER_PROMPTS.detailed;

  const stream = await client.chat.completions.create({
    model,
    max_tokens: 1500,
    stream: true,
    messages: [
      {
        role: "system",
        content: `${buildWikiSystemPrompt(3, course.name, course.units)}\n\n<wiki_content>\n${wikiContent}\n</wiki_content>`,
      },
      {
        role: "user",
        content: `${tierPrompt}\n\nGenerate study notes for: "${topicName}". Write formulas in LaTeX between dollar signs. Output markdown only.`,
      },
    ],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
