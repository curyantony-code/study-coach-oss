import matter from "gray-matter";
import type { NodeType, RawNote } from "./types";

const NODE_TYPES: readonly NodeType[] = ["source", "concept", "entity", "overview", "note"];
const INLINE_TAG = /(?:^|\s)#([A-Za-z][\w/-]*)/g;
const FENCED_CODE = /```[\s\S]*?```/g;

export interface ParsedNote {
  id: string;
  slug: string;
  title: string;
  type: NodeType;
  tags: string[];
  sources: string[];
  updated: string;
  body: string;
  frontmatter: Record<string, unknown>;
  /** First folder below the content root, or null for notes at the root. */
  folder: string | null;
  /** Set when the frontmatter could not be read. */
  problem?: string;
}

export function toList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.split(/[,\s]+/).filter(Boolean);
  if (typeof raw === "number") return [String(raw)];
  return [];
}

export function stripCode(body: string): string {
  return body.replace(FENCED_CODE, "");
}

export function parseSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const parts = content.split(/^## /m);
  if (parts[0]) sections["__intro__"] = parts[0].trim();
  for (let i = 1; i < parts.length; i++) {
    const newline = parts[i].indexOf("\n");
    if (newline === -1) continue;
    sections[parts[i].slice(0, newline).trim()] = parts[i].slice(newline + 1).trim();
  }
  return sections;
}

function inlineTags(body: string): string[] {
  const withoutHeadings = stripCode(body).replace(/^#{1,6}\s.*$/gm, "");
  return [...withoutHeadings.matchAll(INLINE_TAG)].map((m) => m[1]);
}

function readFrontmatter(content: string): { data: Record<string, unknown>; body: string; problem?: string } {
  try {
    // Passing options turns off gray-matter's content cache, which would otherwise hide
    // a frontmatter error the second time the same note is read.
    const parsed = matter(content, {});
    return { data: parsed.data as Record<string, unknown>, body: parsed.content };
  } catch (err) {
    return { data: {}, body: content, problem: err instanceof Error ? err.message.split("\n")[0] : String(err) };
  }
}

function withoutExtension(p: string): string {
  return p.replace(/\.md$/i, "");
}

export function parseNote(raw: RawNote, slugRoot: string): ParsedNote {
  const { data, body, problem } = readFrontmatter(raw.content.replace(/\r\n/g, "\n"));
  const relative = slugRoot && raw.path.startsWith(slugRoot) ? raw.path.slice(slugRoot.length) : raw.path;
  const slug = withoutExtension(relative);
  const segments = relative.split("/");
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const declaredType = String(data.type ?? "");
  const type = (NODE_TYPES as readonly string[]).includes(declaredType) ? (declaredType as NodeType) : "note";
  const tags = [...new Set([...toList(data.tags).map((t) => t.replace(/^#/, "")), ...inlineTags(body)])];

  return {
    id: raw.path,
    slug,
    title: String(data.title || heading || segments[segments.length - 1].replace(/\.md$/i, "")),
    type,
    tags,
    sources: toList(data.sources),
    updated: data.updated instanceof Date ? data.updated.toISOString().slice(0, 10) : String(data.updated || ""),
    body,
    frontmatter: data,
    folder: segments.length > 1 ? segments[0] : null,
    problem,
  };
}
