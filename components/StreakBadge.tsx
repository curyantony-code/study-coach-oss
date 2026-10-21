"use client";
import { useEffect, useState } from "react";
import { getStreak, recordDailyVisit } from "@/lib/progress";

interface Props {
  size?: "sm" | "md";
}

export default function StreakBadge({ size = "md" }: Props) {
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    recordDailyVisit();
    // The streak lives in browser storage, which only exists after the page has loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStreak(getStreak());
  }, []);

  if (streak === 0) return null;

  return (
    <div className={`flex items-center gap-1 rounded-full bg-yellow-50 border border-yellow-200 font-semibold text-yellow-700 ${
      size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
    }`}>
      <span className="flame-pulse">🔥</span>
      <span>{streak} day{streak !== 1 ? "s" : ""}</span>
    </div>
  );
}
