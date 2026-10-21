"use client";

interface Props {
  total: number;
  current: number; // 0-indexed
  maxVisible?: number;
}

export default function ProgressDots({ total, current, maxVisible = 20 }: Props) {
  const visible = Math.min(total, maxVisible);
  const step = total > maxVisible ? total / maxVisible : 1;

  return (
    <div className="flex items-center gap-1 flex-wrap justify-center">
      {Array.from({ length: visible }).map((_, i) => {
        const idx = Math.round(i * step);
        const state =
          idx < current ? "done" :
          idx === current ? "active" : "empty";
        return (
          <span
            key={i}
            className={`progress-dot ${
              state === "done"   ? "progress-dot-done"   :
              state === "active" ? "progress-dot-active" :
                                   "progress-dot-empty"
            }`}
          />
        );
      })}
    </div>
  );
}
