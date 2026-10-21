import { NextRequest, NextResponse } from "next/server";
import { getAllPages } from "@/lib/wiki";
import { parseAiJsonArray } from "@/lib/ai/json";
import { tutorCourse } from "@/lib/course";
import { getActiveContent } from "@/lib/vault/active";
import { client, ollamaClient, MODEL, hasApiKey, buildWikiSystemPrompt } from "@/lib/claude";
import type { SaGradeItem, SaGradeResult } from "@/lib/diagnostic-types";


function saStrictnessGuide(level: number): string {
  if (level <= 1) {
    return "Rubric: award strong partial credit when the student names the right idea and applies it in a broadly reasonable way; minor vocabulary slips are OK.";
  }
  if (level === 2) {
    return "Rubric: require a mostly correct definition and a plausible link to the scenario; small gaps in precision are acceptable.";
  }
  if (level === 3) {
    return "Rubric: require an accurate definition (course terminology) and an explicit application tied to specific facts in the scenario.";
  }
  if (level === 4) {
    return "Rubric: definitions must be precise; application must reference scenario details; vague paraphrases lose marks.";
  }
  return "Rubric: exam-strict — definition must match wiki nuance; application must map cause→effect using scenario facts; any conceptual confusion caps the score at 60.";
}

export async function POST(req: NextRequest) {
  let body: { model?: string; difficulty?: number; saStrictness?: number; items: SaGradeItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "items array required." }, { status: 400 });
  }
  if (items.length > 8) {
    return NextResponse.json({ error: "Too many items per request." }, { status: 400 });
  }

  const model = body.model || MODEL;
  const isLocal = !!model && !model.includes("/");
  if (!isLocal && !hasApiKey()) {
    return NextResponse.json(
      { error: "Add OPENROUTER_API_KEY or OPENAI_API_KEY to .env.local, or choose a local Ollama model." },
      { status: 503 }
    );
  }

  const ai = isLocal ? ollamaClient : client;
  const difficulty = Math.min(5, Math.max(1, Number(body.difficulty) || 3));
  const saStrictness = Math.min(5, Math.max(1, Number(body.saStrictness) || 3));

  const pages = await getAllPages();
  const active = await getActiveContent();
  const course = active ? tutorCourse(active.index) : undefined;
  const slugs = new Set(items.map((i) => i.sourceSlug));
  const context = pages
    .filter((p) => slugs.has(p.slug))
    .map((p) => `# ${p.title} [slug: ${p.slug}]\n${p.rawContent.slice(0, 6000)}`)
    .join("\n\n---\n\n");

  const payload = JSON.stringify(
    items.map((i) => ({
      index: i.index,
      concept: i.concept,
      sourceSlug: i.sourceSlug,
      stem: i.stem,
      studentAnswer: i.studentAnswer,
    })),
    null,
    0
  );

  const userPrompt = `Grade these short answers for ${course?.name ?? "this course"}. Questions and student responses (JSON):
${payload}

GRADING RULES
- ${saStrictnessGuide(saStrictness)}
- Score each answer as an integer 0–100 in "score"
- "feedback" must be 2–5 sentences: what was strong, what was missing or wrong, how to improve
- You MUST cite the course wiki in every feedback using at least one Obsidian-style link with the EXACT slug from the item, written as [[the-exact-slug]] — use the item's sourceSlug when it matches the evidence; you may add ONE extra wiki link only if clearly justified by the wiki context below
- Never invent slugs; only use slugs that appear in <wiki_context> or in each item's sourceSlug field
- If the answer is empty or off-topic, score 0–15 and say so plainly

Return ONLY a JSON array (no markdown fences, no prose before or after), same length and order as the input, one object per item:
[{"index":0,"score":78,"feedback":"..."}]`;

  const systemPrompt = `${buildWikiSystemPrompt(difficulty, course?.name, course?.units)}

<wiki_context>
${context || "(no matching wiki pages — grade conservatively from stems and concepts only)"}
</wiki_context>`;

  try {
    const res = await ai.chat.completions.create({
      model,
      max_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = res.choices[0]?.message?.content || "[]";
    const parsed = parseAiJsonArray(raw) as SaGradeResult[];
    const normalized: SaGradeResult[] = items.map((item, i) => {
      const row =
        parsed.find((r) => r && typeof r === "object" && (r as SaGradeResult).index === item.index) ??
        parsed[i];
      if (!row || typeof row !== "object") {
        return { index: item.index, score: 0, feedback: "Grading failed for this item — try again." };
      }
      const score = Math.min(100, Math.max(0, Math.round(Number((row as SaGradeResult).score) || 0)));
      const feedback = String((row as SaGradeResult).feedback || "").trim() || "No feedback returned.";
      return { index: item.index, score, feedback };
    });

    return NextResponse.json({ grades: normalized });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
