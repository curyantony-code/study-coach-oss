"use client";
import { useEffect, useRef, useState } from "react";
import type { ApiResponse } from "@/lib/api";
import type { RankedVideo, VideoResults } from "@/lib/videos/service";
import type { MatchLabel } from "@/lib/videos/topic";

export interface TopicOption {
  section: string;
  name: string;
}

const MATCH: Record<MatchLabel, { text: string; chip: string }> = {
  strong: { text: "Lines up well", chip: "bg-emerald-100 text-emerald-800" },
  partial: { text: "Partly lines up", chip: "bg-amber-100 text-amber-800" },
  weak: { text: "Loosely related", chip: "bg-slate-200 text-slate-700" },
};

const PRIMARY = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
const SECONDARY = "rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const LINK = "font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export function formatLength(seconds: number | null): string {
  if (seconds === null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function Thumbnail({ video, className }: { video: RankedVideo; className: string }) {
  // A plain <img>: thumbnails come from YouTube's image host at a fixed small size.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={video.thumbnail} alt="" width={320} height={180} loading="lazy" className={className} />;
}

function MatchDetail({ video }: { video: RankedVideo }) {
  const { covers, missing, label } = video.match;
  return (
    <div className="text-sm text-slate-600 mt-2 space-y-1">
      <p><span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${MATCH[label].chip}`}>{MATCH[label].text}</span></p>
      {covers.length > 0 && <p><span className="font-semibold text-slate-700">Mentions:</span> {covers.join(", ")}</p>}
      {missing.length > 0 && <p><span className="font-semibold text-slate-700">Not mentioned:</span> {missing.join(", ")}</p>}
      <p className="text-xs text-slate-500">Judged from the video’s title and description, not from watching it.</p>
    </div>
  );
}

type VideoSource =
  /** A Library note, with a choice of which part to look up. */
  | { slug: string; topics: TopicOption[]; cardId?: undefined }
  /** One study card: searched straight away, by the card's own topic. */
  | { cardId: string; slug?: undefined; topics?: undefined };

/** "Find a video explaining this": the best match for the chosen topic, plus alternatives. */
export default function TopicVideos(source: VideoSource) {
  const { slug, topics, cardId } = source;
  const [section, setSection] = useState("");
  const [results, setResults] = useState<VideoResults | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(0);

  const search = async (forSection: string, variant: number) => {
    const ticket = ++latest.current;
    setBusy(true);
    setError("");
    try {
      const target: Record<string, string> = cardId ? { cardId } : { slug: slug ?? "", section: forSection };
      const response = await fetch(`/api/videos?${new URLSearchParams({ ...target, variant: String(variant) })}`);
      const body = (await response.json()) as ApiResponse<VideoResults>;
      if (ticket !== latest.current) return;
      if (!body.success || !body.data) throw new Error(body.error ?? "Videos could not be found just now.");
      setResults(body.data);
      setSelectedId(body.data.configured ? body.data.videos[0]?.id ?? null : null);
      setPlaying(false);
    } catch (err) {
      if (ticket !== latest.current) return;
      setResults(null);
      setError(err instanceof Error ? err.message : "Videos could not be found just now.");
    } finally {
      if (ticket === latest.current) setBusy(false);
    }
  };

  // A card has one topic and the student has just asked for it: no "Find" button to press.
  const started = useRef(false);
  useEffect(() => {
    if (!cardId || started.current) return;
    started.current = true;
    void search("", 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for this card
  }, [cardId]);

  const videos = results?.configured ? results.videos : [];
  const selected = videos.find((v) => v.id === selectedId) ?? videos[0];
  const others = videos.filter((v) => v.id !== selected?.id);
  const nothingFits = results?.configured && videos.length > 0 && videos[0].match.label === "weak";

  return (
    <section aria-labelledby="topic-videos" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
      {!topics && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 id="topic-videos" className="text-base font-bold text-slate-900">
            {results ? `Videos on ${results.topic.name}` : "Videos explaining this"}
          </h2>
          {!results && <p className="text-sm text-slate-500" role="status">{busy ? "Searching…" : ""}</p>}
        </div>
      )}
      {topics && <div className="flex items-end gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 id="topic-videos" className="text-base font-bold text-slate-900 mb-2">Find a video explaining this</h2>
          <label htmlFor="video-topic" className="sr-only">Which part of the note</label>
          <select
            id="video-topic"
            value={section}
            onChange={(event) => {
              setSection(event.target.value);
              setResults(null);
              setError("");
            }}
            className="w-full max-w-md rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {topics.map((t) => (
              <option key={t.section} value={t.section}>{t.section === "" ? `Whole note: ${t.name}` : t.name}</option>
            ))}
          </select>
        </div>
        <button type="button" className={PRIMARY} disabled={busy} onClick={() => search(section, 0)}>
          {busy ? "Searching…" : "Find videos"}
        </button>
      </div>}

      <div aria-live="polite">
        {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

        {results && !results.configured && (
          <div className="mt-4 text-sm text-slate-700">
            <p className="mb-2">
              Searching and ranking videos inside Study Coach needs your own free YouTube key: add it on <a href="/setup-ai" className={LINK}>Set up AI</a> (step 2). Until then, these searches for “{results.topic.name}” open on YouTube:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              {results.links.map((link) => (
                <li key={link.query}><a href={link.url} target="_blank" rel="noopener noreferrer" className={LINK}>{link.query}</a></li>
              ))}
            </ul>
          </div>
        )}

        {results?.configured && videos.length === 0 && (
          <p className="mt-4 text-sm text-slate-700">
            YouTube found nothing for “{results.query}”.{" "}
            {results.hasOtherWording && <button type="button" className={LINK} onClick={() => search(section, results.variant + 1)}>Try different wording</button>}
          </p>
        )}

        {results?.configured && selected && (
          <div className="mt-4">
            <p className="text-sm text-slate-500 mb-3">Searched YouTube for “{results.query}”.</p>
            {nothingFits && (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Nothing lines up closely with this part of your notes. These are the closest; a different wording may do better.
              </p>
            )}

            <div className="grid md:grid-cols-5 gap-5">
              <div className="md:col-span-3">
                <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
                  {playing ? (
                    <iframe
                      key={selected.id}
                      src={`https://www.youtube-nocookie.com/embed/${selected.id}?autoplay=1&rel=0`}
                      title={selected.title}
                      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                      referrerPolicy="strict-origin-when-cross-origin"
                      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                      className="h-full w-full border-0"
                    />
                  ) : (
                    <button type="button" onClick={() => setPlaying(true)} aria-label={`Play: ${selected.title}`}
                      className="group relative h-full w-full focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-400">
                      <Thumbnail video={selected} className="h-full w-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                      <span aria-hidden="true" className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-xl text-slate-900 shadow-lg group-hover:scale-110 transition-transform">▶</span>
                    </button>
                  )}
                </div>
                <h3 className="mt-3 font-semibold text-slate-900">{selected.title}</h3>
                <p className="text-sm text-slate-500">{[selected.channel, formatLength(selected.seconds)].filter(Boolean).join(" · ")}</p>
                <MatchDetail video={selected} />
              </div>

              <div className="md:col-span-2">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">{others.length > 0 ? "Alternatives" : "No other results"}</h3>
                <ul className="space-y-2">
                  {others.map((video) => (
                    <li key={video.id}>
                      <button type="button" onClick={() => { setSelectedId(video.id); setPlaying(false); }}
                        className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-2 text-left hover:border-blue-400 hover:bg-blue-50 active:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                        <Thumbnail video={video} className="h-14 w-24 shrink-0 rounded-lg object-cover" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-800 line-clamp-2">{video.title}</span>
                          <span className="block text-xs text-slate-500 truncate">{[video.channel, formatLength(video.seconds)].filter(Boolean).join(" · ")}</span>
                          <span className={`mt-1 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${MATCH[video.match.label].chip}`}>{MATCH[video.match.label].text}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              {results.hasOtherWording && (
                <button type="button" className={SECONDARY} disabled={busy} onClick={() => search(section, results.variant + 1)}>
                  None of these fit: try different wording
                </button>
              )}
              <a href={results.searchUrl} target="_blank" rel="noopener noreferrer" className={`text-sm ${LINK}`}>See this search on YouTube</a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
