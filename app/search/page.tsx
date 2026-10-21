"use client";
import { useState, useEffect, useMemo } from "react";
import Fuse from "fuse.js";
import Link from "next/link";

interface PageIndex { slug: string; title: string; type: string; tags: string[]; rawContent: string; }

const TYPE_STYLES: Record<string, string> = {
  source:   "bg-blue-100 text-blue-700",
  concept:  "bg-violet-100 text-violet-700",
  entity:   "bg-emerald-100 text-emerald-700",
  overview: "bg-slate-100 text-slate-600",
};

function excerpt(content: string, query: string): string {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, 140) + "…";
  const s = Math.max(0, idx - 40), e = Math.min(content.length, idx + query.length + 80);
  return (s > 0 ? "…" : "") + content.slice(s, e) + (e < content.length ? "…" : "");
}

export default function SearchPage() {
  const [pages, setPages] = useState<PageIndex[]>([]);
  const [query, setQuery] = useState("");
  const [fuse, setFuse] = useState<Fuse<PageIndex> | null>(null);

  useEffect(() => {
    fetch("/api/pages").then((r) => r.json()).then((data) => {
      setPages(data);
      setFuse(new Fuse(data, {
        keys: [{ name: "title", weight: 3 }, { name: "tags", weight: 2 }, { name: "rawContent", weight: 1 }],
        threshold: 0.35, minMatchCharLength: 2, ignoreLocation: true,
      }));
    });
  }, []);

  const results = useMemo(() => (query.trim() && fuse ? fuse.search(query).map((r) => r.item).slice(0, 15) : []), [query, fuse]);

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <h1 className="text-3xl font-extrabold gradient-text mb-2">Search</h1>
      <p className="text-slate-400 text-sm mb-6">Search across all {pages.length} wiki pages</p>

      <div className="relative mb-2">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Try 'expectancy', 'BFOR', 'Kirkpatrick'…"
          className="w-full pl-11 pr-4 py-3.5 border-2 border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-indigo-400 bg-white shadow-sm"
          autoFocus />
      </div>

      {results.length > 0 && (
        <div className="mt-4 space-y-2">
          {results.map((p) => (
            <Link key={p.slug} href={`/browse/${p.slug}`}
              className="block p-4 bg-white border border-slate-100 rounded-2xl hover:border-indigo-200 hover:shadow-sm transition-all shadow-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-semibold text-slate-800 text-sm">{p.title}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_STYLES[p.type] || "bg-slate-100 text-slate-600"}`}>{p.type}</span>
              </div>
              {query.length > 1 && (
                <p className="text-xs text-slate-500 leading-relaxed mb-1.5">{excerpt(p.rawContent, query)}</p>
              )}
              {p.tags.length > 0 && (
                <div className="flex gap-1">
                  {p.tags.slice(0, 4).map((t) => (
                    <span key={t} className="text-xs text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {query.length > 1 && results.length === 0 && pages.length > 0 && (
        <div className="mt-12 text-center text-slate-400">No results for “{query}”</div>
      )}
    </div>
  );
}
