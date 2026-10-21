"use client";
import { useState, useEffect, useRef } from "react";
import Answer from "@/components/ai/Answer";
import Mascot from "@/components/Mascot";
import { useCourse } from "@/lib/use-course";

const TIERS = [
  { id: "summary",       label: "Summary",       desc: "Key points only, ~400 words" },
  { id: "detailed",      label: "Detailed",      desc: "Headings + examples, ~700 words" },
  { id: "comprehensive", label: "Comprehensive", desc: "Everything + exam traps, ~1200 words" },
];


export default function NotesPage() {
  const course = useCourse();
  const topics = [{ id: "all", label: "All topics" }, ...course.units.map((u) => ({ id: u.id, label: u.label }))];
  const [topic, setTopic]           = useState("all");
  const [tier, setTier]             = useState("detailed");
  const [notes, setNotes]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const abortRef                    = useRef<AbortController | null>(null);

  const generate = async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setNotes("");
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/notes?topic=${encodeURIComponent(topic)}&tier=${tier}`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const msg = await res.text();
        setError(msg);
        setLoading(false);
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        setNotes(buf);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") setError("Generation failed.");
    }
    setLoading(false);
  };

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const copyToClipboard = () => navigator.clipboard?.writeText(notes);

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Mascot mood={loading ? "thinking" : notes ? "happy" : "idle"} size={44} />
        <div>
          <h1 className="text-3xl font-extrabold gradient-text mb-0.5">Notes</h1>
          <p className="text-slate-400 text-sm">AI-generated study notes from your wiki content</p>
        </div>
      </div>

      {/* Config card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 space-y-5">
        {/* Topic */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Topic</label>
          <select value={topic} onChange={(e) => setTopic(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300">
            {topics.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>

        {/* Tier */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Detail Level</label>
          <div className="flex gap-2">
            {TIERS.map((t) => (
              <button key={t.id} onClick={() => setTier(t.id)}
                className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-colors text-left ${
                  tier === t.id
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}>
                <div className="font-semibold">{t.label}</div>
                <div className="text-xs opacity-70 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <button onClick={generate} disabled={loading}
          className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm">
          {loading ? "Generating notes…" : "Generate Notes ✨"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm mb-6">{error}</div>
      )}

      {/* Notes output */}
      {notes && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-600">
              {topics.find((t) => t.id === topic)?.label} — {TIERS.find((t) => t.id === tier)?.label}
            </span>
            <button onClick={copyToClipboard}
              className="text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors">
              Copy ↗
            </button>
          </div>
          <div className="px-6 py-5 text-sm leading-relaxed text-slate-700">
            <Answer text={notes} />
          </div>
          {loading && (
            <div className="px-6 pb-5 flex items-center gap-2 text-slate-400 text-sm">
              <span className="animate-pulse">●</span> Writing…
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!notes && !loading && !error && (
        <div className="text-center py-16 text-slate-300">
          <Mascot mood="idle" size={64} />
          <p className="mt-4 text-slate-400">Pick a topic and detail level, then hit Generate.</p>
        </div>
      )}
    </div>
  );
}
