"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import AskPanel from "@/components/ai/AskPanel";
import { rangeToText } from "@/lib/selection";

const MIN_SELECTION = 2;
const MAX_SELECTION = 4000;
const BUTTON_OFFSET = 8;

interface FloatingButton {
  top: number;
  left: number;
  text: string;
}

/**
 * Wraps a Library note. Highlighting text inside it offers "Ask AI", which opens a panel
 * where the AI explains the passage using the note as its source, and takes follow-ups.
 */
export default function AskAboutSelection({ slug, providerLabel, children }: { slug: string; providerLabel: string; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const [button, setButton] = useState<FloatingButton | null>(null);
  const [quote, setQuote] = useState<string | null>(null);

  // Offer the button whenever some text inside the note is highlighted.
  useEffect(() => {
    const update = () => {
      const selection = document.getSelection();
      const range = selection && selection.rangeCount > 0 && !selection.isCollapsed ? selection.getRangeAt(0) : null;
      if (!range || !container.current?.contains(range.commonAncestorContainer)) return setButton(null);
      const text = rangeToText(range);
      if (text.length < MIN_SELECTION) return setButton(null);
      const rect = range.getBoundingClientRect();
      setButton({
        text,
        top: Math.min(rect.bottom + BUTTON_OFFSET, window.innerHeight - 56),
        left: Math.max(12, Math.min(rect.left, window.innerWidth - 150)),
      });
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update);
    };
  }, []);

  const close = useCallback(() => setQuote(null), []);

  const open = () => {
    if (!button) return;
    setQuote(button.text.slice(0, MAX_SELECTION));
    setButton(null);
  };

  return (
    <div ref={container} className="relative">
      {children}

      {/* Rendered on <body>: the page's fade-in animation would otherwise trap "fixed" elements inside it. */}
      {button && quote === null && createPortal(
        <button
          type="button"
          // Keep the highlight while the button is pressed.
          onMouseDown={(event) => event.preventDefault()}
          onClick={open}
          style={{ top: button.top, left: button.left }}
          className="fixed z-30 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
        >
          ✨ Ask AI
        </button>,
        document.body
      )}

      {quote !== null && (
        <AskPanel
          key={quote}
          slug={slug}
          quote={quote}
          title="Ask AI about this"
          disclosure={`Sends the highlight and this note to ${providerLabel}.`}
          onClose={close}
        />
      )}
    </div>
  );
}
