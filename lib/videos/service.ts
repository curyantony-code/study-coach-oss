// Finds videos for a topic: builds the search from the note, asks YouTube (or its cache),
// and ranks the results by how well they line up with the note's content.
import type { Db } from "../db/client";
import type { Node } from "../vault/types";
import { buildQueries, matchVideo, topicsOf, youtubeSearchUrl, type MatchResult, type Topic } from "./topic";
import { searchYouTube, type SearchOptions, type Video } from "./youtube";

/** Results are reused for this long, so reopening a note does not spend the daily search allowance. */
const CACHE_DAYS = 14;
const MAX_SHOWN = 6;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RankedVideo extends Video {
  match: MatchResult;
}

export interface SearchLink {
  query: string;
  url: string;
}

export type VideoResults =
  | { configured: false; topic: Topic; links: SearchLink[] }
  | { configured: true; topic: Topic; query: string; searchUrl: string; videos: RankedVideo[]; variant: number; hasOtherWording: boolean };

function cached(db: Db, query: string, now: Date): Video[] | null {
  const row = db.prepare("SELECT results, fetched_at FROM video_cache WHERE query = ?").get(query) as { results: string; fetched_at: string } | undefined;
  if (!row || now.getTime() - Date.parse(row.fetched_at) > CACHE_DAYS * MS_PER_DAY) return null;
  try {
    return JSON.parse(row.results) as Video[];
  } catch {
    return null;
  }
}

function store(db: Db, query: string, videos: Video[], now: Date): void {
  db.prepare(
    "INSERT INTO video_cache (query, results, fetched_at) VALUES (?, ?, ?) ON CONFLICT(query) DO UPDATE SET results = excluded.results, fetched_at = excluded.fetched_at"
  ).run(query, JSON.stringify(videos), now.toISOString());
}

/** Best match first; YouTube's own relevance order breaks ties. */
export function rankVideos(videos: Video[], topic: Topic): RankedVideo[] {
  return videos
    .map((video, order) => ({ video: { ...video, match: matchVideo(video, topic) }, order }))
    .sort((a, b) => b.video.match.score - a.video.match.score || a.order - b.order)
    .map(({ video }) => video);
}

export interface FindVideosInput {
  node: Pick<Node, "title" | "body">;
  /** "" for the whole note, otherwise a `##` heading. */
  section: string;
  /** Use this topic instead of looking `section` up in the note (a study card's own topic). */
  topic?: Topic;
  /** Which wording of the search to use: 0 is the first choice, higher numbers are alternatives. */
  variant: number;
}

export interface FindVideosDeps {
  db: Db;
  /** Null when no YouTube key is configured. */
  youtube: SearchOptions | null;
  now?: Date;
}

export async function findVideos({ node, section, variant, topic: given }: FindVideosInput, { db, youtube, now = new Date() }: FindVideosDeps): Promise<VideoResults | null> {
  const topic = given ?? topicsOf(node).find((t) => t.section === section);
  if (!topic) return null;
  const queries = buildQueries(topic);
  if (!youtube) return { configured: false, topic, links: queries.map((query) => ({ query, url: youtubeSearchUrl(query) })) };

  const index = Math.min(Math.max(variant, 0), queries.length - 1);
  const query = queries[index];
  let videos = cached(db, query, now);
  if (!videos) {
    videos = await searchYouTube(query, youtube);
    store(db, query, videos, now);
  }
  return {
    configured: true,
    topic,
    query,
    searchUrl: youtubeSearchUrl(query),
    videos: rankVideos(videos, topic).slice(0, MAX_SHOWN),
    variant: index,
    hasOtherWording: index + 1 < queries.length,
  };
}

/** Reads the YouTube settings from the environment. `YOUTUBE_API_BASE` exists for testing against a stand-in server. */
export function youtubeFromEnv(): SearchOptions | null {
  const apiKey = process.env.YOUTUBE_API_KEY;
  return apiKey ? { apiKey, base: process.env.YOUTUBE_API_BASE || undefined } : null;
}
