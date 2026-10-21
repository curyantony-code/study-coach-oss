"use client";
import { useCallback, useState } from "react";
import AskPanel from "@/components/ai/AskPanel";
import TopicVideos from "@/components/library/TopicVideos";

/** The most the AI accepts as the text being asked about. */
const MAX_QUOTE = 4000;

const BUTTON = "rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50 active:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

interface CardHelpProps {
  cardId: string;
  /** The Library note the card came from. */
  nodeSlug: string;
  front: string;
  back: string;
  providerLabel: string;
}

/**
 * Offered once a card's answer is showing: a video on the card's topic, or a chat with the AI
 * about the card. Mount with `key={cardId}` so each card starts closed.
 */
export default function CardHelp({ cardId, nodeSlug, front, back, providerLabel }: CardHelpProps) {
  const [videosOpen, setVideosOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const closeChat = useCallback(() => setChatOpen(false), []);
  const quote = `Question: ${front}\n\nAnswer: ${back}`.slice(0, MAX_QUOTE);

  return (
    <section aria-label="More help with this card" className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500 mr-1">Still unclear?</span>
        <button type="button" className={BUTTON} aria-expanded={videosOpen} onClick={() => setVideosOpen((open) => !open)}>
          ▶ {videosOpen ? "Hide videos" : "Watch a video"}
        </button>
        <button type="button" className={BUTTON} aria-expanded={chatOpen} onClick={() => setChatOpen(true)}>
          ✨ Ask AI
        </button>
      </div>

      {videosOpen && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-slate-500">Searches YouTube for this card’s topic. Only the topic’s name and a few key terms are sent.</p>
          <TopicVideos cardId={cardId} />
        </div>
      )}

      {chatOpen && (
        <AskPanel
          slug={nodeSlug}
          quote={quote}
          title="Ask AI about this card"
          disclosure={`Sends this card and the note it came from to ${providerLabel}.`}
          onClose={closeChat}
        />
      )}
    </section>
  );
}
