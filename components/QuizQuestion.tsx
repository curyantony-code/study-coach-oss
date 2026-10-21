"use client";
import MathText from "@/components/MathText";
import Link from "next/link";
import Confetti from "@/components/Confetti";

interface Option { text: string; correct: boolean; }

interface Props {
  stem: string;
  options: Option[];
  explanation: string;
  sourceSlug: string;
  /** The worked example an AI-written question was modelled on. */
  basedOn?: { cardId: string; heading: string };
  index: number;
  total: number;
  selected: number | null;
  onSelect: (i: number) => void;
}

const LABELS = ["A", "B", "C", "D"];

export default function QuizQuestion({ stem, options, explanation, sourceSlug, basedOn, index, total, selected, onSelect }: Props) {
  const answered = selected !== null;
  const correct  = answered && options[selected!]?.correct;

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <Confetti trigger={!!correct} origin={{ x: 0.5, y: 0.5 }} />

      <div className="text-xs font-medium text-slate-400 mb-3">Question {index + 1} of {total}</div>
      <p className="text-lg font-semibold text-slate-800 mb-6 leading-relaxed"><MathText text={stem} /></p>
      <div className="space-y-3">
        {options.map((opt, i) => {
          let cls = "w-full text-left px-4 py-3.5 rounded-xl border-2 text-sm font-medium transition-all duration-150 flex items-start gap-3 ";
          if (!answered) {
            cls += "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 cursor-pointer shadow-sm";
          } else if (opt.correct) {
            cls += "border-emerald-400 bg-emerald-50 text-emerald-800";
          } else if (i === selected) {
            cls += "border-red-400 bg-red-50 text-red-800 animate-shake";
          } else {
            cls += "border-slate-100 bg-white text-slate-400 opacity-60";
          }
          return (
            <button key={i} className={cls} disabled={answered} onClick={() => onSelect(i)}>
              <span className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold mt-0.5 ${
                answered && opt.correct    ? "border-emerald-500 bg-emerald-500 text-white"
                : answered && i === selected ? "border-red-500 bg-red-500 text-white"
                : "border-current"
              }`}>{LABELS[i]}</span>
              <span><MathText text={opt.text} /></span>
            </button>
          );
        })}
      </div>
      {answered && (
        <div className={`mt-5 p-4 rounded-xl border animate-fade-in text-sm ${
          correct ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-800"
        }`}>
          <p className="font-semibold mb-1">{correct ? "✓ Correct!" : "✗ Incorrect"}</p>
          <p className="text-slate-700 mb-2 whitespace-pre-line"><MathText text={explanation} /></p>
          {basedOn && (
            <p className="mb-2 text-xs text-slate-600">
              Modelled on your worked example{" "}
              <Link href={`/problems/${basedOn.cardId}`} className="font-medium text-blue-600 hover:underline">{basedOn.heading}</Link>
              , with the numbers changed. AI-written: check the working against the example if an answer looks off.
            </p>
          )}
          <Link href={`/browse/${sourceSlug.split("/").map(encodeURIComponent).join("/")}`} className="text-blue-600 hover:underline text-xs font-medium">
            Review: {sourceSlug.split("/").pop()?.replace(/-/g, " ")} →
          </Link>
        </div>
      )}
    </div>
  );
}
