import { getAllPages } from "@/lib/wiki";
import { ClaudeUnreachableError, describeClaudeError, hasClaude, isClaudeModel, streamClaudeTutor } from "@/lib/ai/claude-tutor";
import { streamChatResponse, hasApiKey, buildSmartContext, buildWikiSystemPrompt } from "@/lib/claude";
import { smallLocalModel } from "@/lib/ai/local-models";
import { tutorCourse } from "@/lib/course";
import { getActiveContent } from "@/lib/vault/active";
import { dailyTokenLimitForModel, isLocalModel } from "@/lib/token-limits";

const STREAM_HEADERS = { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked" };
import { NextRequest, NextResponse } from "next/server";
import { needOwnKey } from "@/lib/ai/keys";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { messages, model, sessionTokensUsed = 0, difficulty = 3 } = body;

  const dailyLimit = dailyTokenLimitForModel(typeof model === "string" ? model : undefined);
  if (sessionTokensUsed >= dailyLimit) {
    return NextResponse.json(
      { error: `Daily token limit reached (${dailyLimit.toLocaleString()} tokens). Resets at midnight.` },
      { status: 429 }
    );
  }

  const isLocal = isLocalModel(model);
  // Claude is the default whenever its key is set, unless a local or OpenRouter model was picked.
  const useClaude = hasClaude() && (!model || isClaudeModel(model));
  if (!isLocal && !useClaude && !hasApiKey()) {
    return NextResponse.json(
      { error: needOwnKey("ANTHROPIC_API_KEY or OPENROUTER_API_KEY") },
      { status: 503 }
    );
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
  }

  const pages = await getAllPages();
  const wikiContext = buildSmartContext(pages, messages);
  const active = await getActiveContent();
  const course = active ? tutorCourse(active.index) : undefined;

  if (useClaude) {
    const system = `${buildWikiSystemPrompt(difficulty, course?.name, course?.units)}\n\n<wiki_content>\n${wikiContext}\n</wiki_content>`;
    try {
      return new NextResponse(await streamClaudeTutor(system, messages, isClaudeModel(model) ? model : undefined, req.signal), { headers: STREAM_HEADERS });
    } catch (err) {
      if (!(err instanceof ClaudeUnreachableError)) {
        console.error("Claude tutor request failed", err);
        return NextResponse.json({ error: describeClaudeError(err) }, { status: 502 });
      }
      // Offline: fall through to the local model below.
    }
  }

  // A Claude id reaching this point means Claude was unreachable: use the local model instead.
  // Only ever a small one; with none installed, the cloud default answers.
  const fallbackModel = useClaude ? ((await smallLocalModel()) ?? undefined) : model;

  try {
    const stream = await streamChatResponse(messages, wikiContext, sessionTokensUsed, fallbackModel, difficulty, course);
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "SESSION_LIMIT_REACHED") {
      const lim = dailyTokenLimitForModel(typeof model === "string" ? model : undefined);
      return NextResponse.json(
        { error: `Daily token limit reached (${lim.toLocaleString()} tokens). Resets at midnight.` },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
