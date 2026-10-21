// YouTube's official search (Data API v3). Needs a free API key from Google; without one
// the app offers ready-made YouTube search links instead.
import { z } from "zod";

const DEFAULT_BASE = "https://www.googleapis.com/youtube/v3";
const MAX_RESULTS = 10;
/** Clips shorter than this are Shorts or teasers, not explanations. */
const MIN_SECONDS = 90;

export interface Video {
  id: string;
  title: string;
  description: string;
  channel: string;
  publishedAt: string;
  thumbnail: string;
  /** Length in seconds, or null when YouTube did not report it. */
  seconds: number | null;
}

export class VideoSearchError extends Error {}

const searchSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.object({ videoId: z.string().regex(/^[\w-]{6,20}$/) }),
        snippet: z.object({
          title: z.string(),
          description: z.string().default(""),
          channelTitle: z.string().default(""),
          publishedAt: z.string().default(""),
        }),
      })
    )
    .default([]),
});

const detailsSchema = z.object({
  items: z.array(z.object({ id: z.string(), contentDetails: z.object({ duration: z.string() }) })).default([]),
});

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };

/** The API returns titles with HTML entities; React escapes on output, so decode them here. */
export function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#39);/g, (entity) => ENTITIES[entity] ?? entity);
}

/** "PT1H2M3S" → 3723. */
export function parseDuration(iso: string): number | null {
  const match = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const [days, hours, minutes, seconds] = match.slice(1).map((v) => Number(v ?? 0));
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

export interface SearchOptions {
  apiKey: string;
  base?: string;
  fetchFn?: typeof fetch;
}

async function getJson(url: URL, fetchFn: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new VideoSearchError("YouTube could not be reached. Check your internet connection.");
  }
  if (response.status === 403 || response.status === 429) {
    throw new VideoSearchError("YouTube's daily search allowance for your key is used up, or the key is not allowed to search. It resets overnight.");
  }
  if (response.status === 400 || response.status === 401) {
    throw new VideoSearchError("YouTube did not accept the API key. Check YOUTUBE_API_KEY in .env.local.");
  }
  if (!response.ok) throw new VideoSearchError(`YouTube returned an error (${response.status}). Try again shortly.`);
  return response.json();
}

/** Searches for embeddable videos, drops very short clips, and adds each video's length. */
export async function searchYouTube(query: string, { apiKey, base = DEFAULT_BASE, fetchFn = fetch }: SearchOptions): Promise<Video[]> {
  const searchUrl = new URL(`${base}/search`);
  searchUrl.search = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: query,
    maxResults: String(MAX_RESULTS),
    videoEmbeddable: "true",
    safeSearch: "strict",
    relevanceLanguage: "en",
    key: apiKey,
  }).toString();
  const found = searchSchema.safeParse(await getJson(searchUrl, fetchFn));
  if (!found.success) throw new VideoSearchError("YouTube sent back results in an unexpected format.");
  if (found.data.items.length === 0) return [];

  const detailsUrl = new URL(`${base}/videos`);
  detailsUrl.search = new URLSearchParams({ part: "contentDetails", id: found.data.items.map((i) => i.id.videoId).join(","), key: apiKey }).toString();
  // Lengths are a nicety: if this second call fails the results are still shown.
  const details = detailsSchema.safeParse(await getJson(detailsUrl, fetchFn).catch(() => null));
  const seconds = new Map((details.success ? details.data.items : []).map((d) => [d.id, parseDuration(d.contentDetails.duration)]));

  return found.data.items
    .map(({ id, snippet }) => ({
      id: id.videoId,
      title: decodeEntities(snippet.title),
      description: decodeEntities(snippet.description),
      channel: decodeEntities(snippet.channelTitle),
      publishedAt: snippet.publishedAt,
      thumbnail: `https://i.ytimg.com/vi/${id.videoId}/mqdefault.jpg`,
      seconds: seconds.get(id.videoId) ?? null,
    }))
    .filter((video) => video.seconds === null || video.seconds >= MIN_SECONDS);
}
