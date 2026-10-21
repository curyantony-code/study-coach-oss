import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { explainSystemPrompt, firstTurn, MAX_QUESTION_LENGTH, MAX_SELECTION_LENGTH, MAX_TURNS, streamExplanation } from "@/lib/ai/explain";
import { getActiveContent } from "@/lib/vault/active";

const bodySchema = z.object({
  slug: z.string().min(1).max(600),
  selection: z.string().trim().min(1).max(MAX_SELECTION_LENGTH),
  question: z.string().max(MAX_QUESTION_LENGTH).default(""),
  /** Earlier turns of this conversation: the AI's answers and the student's follow-up questions. */
  followUps: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(20_000) }))
    .max(MAX_TURNS)
    .default([]),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Highlight a shorter passage (up to a few paragraphs) and try again." }, { status: 400 });
  }
  const active = await getActiveContent();
  const node = active?.index.nodes.find((n) => n.slug === parsed.data.slug);
  if (!active || !node) return NextResponse.json({ error: "That note is not in the vault you are studying." }, { status: 404 });

  const { selection, question, followUps } = parsed.data;
  const system = explainSystemPrompt(active.index.course.name, node.title, node.body);
  const turns = [{ role: "user" as const, content: firstTurn(selection, question) }, ...followUps];
  if (turns[turns.length - 1].role !== "user") return NextResponse.json({ error: "Ask a question to continue." }, { status: 400 });

  const result = await streamExplanation(system, turns);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return new NextResponse(result.stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
