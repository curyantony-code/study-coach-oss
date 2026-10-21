import { toFlashcards } from "@/lib/flashcards";
import { getActiveContent } from "@/lib/vault/active";
import { NextResponse } from "next/server";

export async function GET() {
  const active = await getActiveContent();
  return NextResponse.json(active ? toFlashcards(active.index) : []);
}
