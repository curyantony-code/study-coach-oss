import { NextResponse } from "next/server";
import { cloudHosted, rankSmallModels, type InstalledModel } from "@/lib/ai/local-models";

interface OllamaModel {
  name: string;
  size?: number;
  details?: { parameter_size?: string };
}

/**
 * The Ollama models the chat may use: cloud-hosted ones, and local ones small enough for this
 * computer (see MAX_SMALL_PARAMETERS). A large local model is never offered, whatever is installed.
 */
export async function GET() {
  try {
    const base = (process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1").replace(/\/v1\/?$/, "");
    const res = await fetch(`${base}/api/tags`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    if (!res.ok) return NextResponse.json({ models: [] });
    const data = (await res.json()) as { models?: OllamaModel[] };
    const installed: InstalledModel[] = (data.models ?? []).map((m) => ({ name: m.name, size: m.size ?? 0, parameterSize: m.details?.parameter_size }));
    return NextResponse.json({ models: [...cloudHosted(installed), ...rankSmallModels(installed)] });
  } catch {
    return NextResponse.json({ models: [] });
  }
}
