import { NextResponse } from "next/server";
import { hasClaude, MODEL_MAIN } from "@/lib/ai/claude-tutor";
import { CLOUD_MODELS } from "@/lib/claude";

/** Cloud models the chat can pick from. Claude comes first when its key is set, so it is the default. */
export async function GET() {
  const claude = hasClaude() ? [{ id: MODEL_MAIN, label: "Claude", context: 1_000_000 }] : [];
  return NextResponse.json({ models: [...claude, ...CLOUD_MODELS] });
}
