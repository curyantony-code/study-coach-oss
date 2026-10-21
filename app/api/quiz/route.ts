import { getAllPages } from "@/lib/wiki";
import { generateStaticQuiz, quizFromCards } from "@/lib/quiz";
import { generateAIQuiz, buildSmartContext } from "@/lib/claude";
import { generateVariantQuiz } from "@/lib/ai/variant-quiz";
import { tutorCourse } from "@/lib/course";
import { coverageFor, type ExamPart } from "@/lib/exam-parts";
import { toFlashcards } from "@/lib/flashcards";
import { getSchedule } from "@/lib/schedule/store";
import { getActiveContent } from "@/lib/vault/active";
import { guarded } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";

const MAX_QUESTIONS = 30;

/**
 * Builds a quiz. What it covers, most specific first:
 *   note=<slug>   one note (one topic)
 *   topic=<unit>  one unit, or a free-text topic
 *   part=midterm|final   what that exam covers
 * With mode=ai, questions are modelled on the worked examples in that material (same method,
 * new numbers); where there are no examples the AI writes concept questions from the notes.
 */
export function GET(req: NextRequest) {
  return guarded("Building a quiz", () => buildQuiz(req));
}

async function buildQuiz(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("mode") || "static";
  const topic = searchParams.get("topic") || undefined;
  const noteSlug = searchParams.get("note") || undefined;
  const part = searchParams.get("part");
  const n = Math.min(Math.max(parseInt(searchParams.get("n") || "10", 10) || 10, 1), MAX_QUESTIONS);
  const model = searchParams.get("model") || undefined;

  const active = await getActiveContent();
  if (!active) return NextResponse.json([]);
  const { index } = active;
  const allPages = await getAllPages();

  // The notes this quiz draws on.
  const note = noteSlug ? index.nodes.find((node) => node.slug === noteSlug) : undefined;
  const unit = !note ? index.units.find((u) => u.id === topic) : undefined;
  let nodeIds: Set<string> | null = null;
  let topicName: string | undefined = topic;
  if (note) {
    nodeIds = new Set([note.id]);
    topicName = note.title;
  } else if (part === "midterm" || part === "final") {
    nodeIds = new Set(coverageFor(part as ExamPart, index, getSchedule(active.vault.id)?.entries ?? null).nodeIds);
    topicName = part === "midterm" ? "the midterm material" : "the whole course";
  } else if (unit) {
    nodeIds = new Set(index.nodes.filter((node) => node.unitIds.includes(unit.id)).map((node) => node.id));
    topicName = unit.label;
  }
  const slugById = new Map(index.nodes.map((node) => [node.id, node.slug]));
  const scopedSlugs = nodeIds ? new Set([...nodeIds].map((id) => slugById.get(id))) : null;
  const scopedPages = scopedSlugs ? allPages.filter((p) => scopedSlugs.has(p.slug)) : [];
  const pages = scopedPages.length > 0 ? scopedPages : allPages;
  const cards = nodeIds ? index.cards.filter((c) => nodeIds.has(c.nodeId)) : index.cards;
  const freeText = nodeIds ? undefined : topic;

  const questions: unknown[] = [];
  if (mode === "ai" && (process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY)) {
    const course = tutorCourse(index);
    // First choice: new questions modelled on the worked examples in this material.
    const hasExamples = cards.some((c) => c.type === "problem");
    questions.push(...(await generateVariantQuiz(cards, (id) => slugById.get(id) ?? id, course.name, n, model)));
    // If the AI could not manage a single variant it is not answering today: do not wait on it twice.
    const aiDown = hasExamples && questions.length === 0;
    if (questions.length < n && !aiDown) {
      try {
        const wikiContext = buildSmartContext(pages, [{ role: "user", content: topicName || "general" }]);
        const written = await generateAIQuiz(topicName || "the whole course", n - questions.length, wikiContext, model, course);
        // "Review this page" must lead somewhere real, whatever slug the AI wrote.
        const known = new Set(pages.map((p) => p.slug));
        questions.push(
          ...written
            .filter(
              (q) =>
                q &&
                typeof q.stem === "string" &&
                typeof q.explanation === "string" &&
                Array.isArray(q.options) &&
                q.options.length >= 2 &&
                q.options.every((o) => o && typeof o.text === "string" && o.text.trim() !== "") &&
                q.options.filter((o) => o.correct === true).length === 1
            )
            .map((q) => ({ ...q, sourceSlug: known.has(q.sourceSlug) ? q.sourceSlug : pages[0].slug }))
            .slice(0, n - questions.length)
        );
      } catch (error) {
        // The ready-made questions below still work when the AI is unreachable.
        console.error("AI quiz failed", error);
      }
    }
    if (questions.length >= n) return NextResponse.json(questions.slice(0, n));
  }

  const fromNotes = generateStaticQuiz(pages, freeText, n - questions.length);
  questions.push(...fromNotes);
  if (questions.length < n) {
    // Vaults without the wiki layout have no "entity" pages: build the questions from study cards.
    const flash = toFlashcards({ ...index, cards });
    questions.push(...quizFromCards(flash, n - questions.length, freeText));
  }
  return NextResponse.json(questions.slice(0, n));
}
