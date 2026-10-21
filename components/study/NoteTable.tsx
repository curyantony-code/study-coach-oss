"use client";
import Link from "next/link";
import { useState } from "react";
import { masteryTone } from "@/components/study/MasteryBar";

export interface NoteRow {
  id: string;
  title: string;
  href: string;
  studyHref: string;
  cards: number;
  mastery: number;
  confidentWrong: number;
  /** ISO time, or null when never studied. */
  lastStudied: string | null;
}

type SortKey = "mastery" | "title" | "cards" | "confidentWrong" | "lastStudied";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "title", label: "Note", numeric: false },
  { key: "mastery", label: "Mastery", numeric: true },
  { key: "cards", label: "Cards", numeric: true },
  { key: "confidentWrong", label: "Sure but wrong", numeric: true },
  { key: "lastStudied", label: "Last studied", numeric: false },
];

function compare(a: NoteRow, b: NoteRow, key: SortKey): number {
  if (key === "title") return a.title.localeCompare(b.title, undefined, { numeric: true });
  if (key === "lastStudied") return (a.lastStudied ?? "").localeCompare(b.lastStudied ?? "");
  return a[key] - b[key];
}

export default function NoteTable({ rows }: { rows: NoteRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: "mastery", ascending: true });
  const sorted = [...rows].sort((a, b) => (sort.ascending ? 1 : -1) * compare(a, b, sort.key) || compare(a, b, "title"));
  const toggle = (key: SortKey) => setSort((s) => ({ key, ascending: s.key === key ? !s.ascending : true }));

  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
            {COLUMNS.map((column) => (
              <th key={column.key} scope="col" className={`pb-2 font-semibold ${column.numeric ? "text-right" : ""}`}
                aria-sort={sort.key === column.key ? (sort.ascending ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => toggle(column.key)}
                  className="uppercase tracking-wider font-semibold hover:text-slate-900 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  {column.label}
                  <span aria-hidden="true" className="ml-1">{sort.key === column.key ? (sort.ascending ? "↑" : "↓") : ""}</span>
                </button>
              </th>
            ))}
            <th scope="col" className="pb-2"><span className="sr-only">Study</span></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const tone = masteryTone(row.mastery);
            return (
              <tr key={row.id} className="border-t border-slate-100">
                <th scope="row" className="py-2 pr-3 text-left font-medium">
                  <Link href={row.href} className="text-slate-800 hover:text-blue-700 underline-offset-2 hover:underline">{row.title}</Link>
                </th>
                <td className={`py-2 text-right tabular-nums font-semibold whitespace-nowrap ${tone.text}`}>
                  {Math.round(row.mastery * 100)}% <span className="font-normal text-slate-500">{tone.word}</span>
                </td>
                <td className="py-2 text-right tabular-nums text-slate-700">{row.cards}</td>
                <td className={`py-2 text-right tabular-nums ${row.confidentWrong > 0 ? "text-rose-700 font-semibold" : "text-slate-400"}`}>{row.confidentWrong}</td>
                <td className="py-2 pl-4 text-slate-600 whitespace-nowrap">{row.lastStudied ? row.lastStudied.slice(0, 10) : "Never"}</td>
                <td className="py-2 pl-3 text-right">
                  <Link href={row.studyHref} className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">Study</Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
