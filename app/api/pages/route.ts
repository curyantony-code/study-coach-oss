import { getAllPages } from "@/lib/wiki";
import { NextResponse } from "next/server";

export async function GET() {
  const pages = await getAllPages();
  const lightweight = pages.map((p) => ({
    slug: p.slug,
    title: p.title,
    type: p.type,
    tags: p.tags,
    sources: p.sources,
    updated: p.updated,
    rawContent: p.rawContent,
  }));
  return NextResponse.json(lightweight);
}
