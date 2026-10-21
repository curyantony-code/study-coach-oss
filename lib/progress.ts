"use client";
import { logAttempt } from "./study-client";

export interface CardProgress {
  id: string;
  correct: number;
  incorrect: number;
  mastered: boolean;
  lastSeen: string;
}

const KEY = "study-coach-progress";
const KNOWN_KEY = "study-coach-known";
const MATCH_KEY = "study-coach-match-best";

/**
 * A browser-storage key for the vault on screen, so each course keeps its own saved
 * scores and conversations. The layout writes the vault id on <main>.
 */
export function vaultStorageKey(base: string): string {
  if (typeof document === "undefined") return base;
  const vaultId = document.querySelector("main")?.dataset.vault;
  return vaultId ? `${base}:${vaultId}` : base;
}
const STREAK_KEY = "study-coach-streak";

export function loadProgress(): Map<string, CardProgress> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Map();
    const arr: CardProgress[] = JSON.parse(raw);
    return new Map(arr.map((p) => [p.id, p]));
  } catch {
    return new Map();
  }
}

export function saveProgress(map: Map<string, CardProgress>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify([...map.values()]));
}

export function recordAnswer(id: string, correct: boolean, mode: "learn" | "write"): void {
  // The database is the record that counts; the browser copy below only drives this page.
  logAttempt({ cardId: id, mode, correct });
  const map = loadProgress();
  const existing = map.get(id) ?? { id, correct: 0, incorrect: 0, mastered: false, lastSeen: "" };
  const updated: CardProgress = {
    ...existing,
    correct: correct ? existing.correct + 1 : existing.correct,
    incorrect: correct ? existing.incorrect : existing.incorrect + 1,
    mastered: correct && existing.correct >= 1,
    lastSeen: new Date().toISOString(),
  };
  map.set(id, updated);
  saveProgress(map);
}

export function resetProgress(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export function loadKnown(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KNOWN_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveKnown(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KNOWN_KEY, JSON.stringify([...ids]));
}

export function getMatchBest(topic: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(vaultStorageKey(MATCH_KEY));
    if (!raw) return null;
    const map: Record<string, number> = JSON.parse(raw);
    return map[topic] ?? null;
  } catch {
    return null;
  }
}

export function saveMatchBest(topic: string, timeMs: number): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(vaultStorageKey(MATCH_KEY));
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    if (!map[topic] || timeMs < map[topic]) {
      map[topic] = timeMs;
      localStorage.setItem(vaultStorageKey(MATCH_KEY), JSON.stringify(map));
    }
  } catch {}
}

// ── Streak & achievements ───────────────────────────────────────────────────

interface StreakData {
  dates: string[]; // ISO date strings (YYYY-MM-DD), deduplicated, sorted
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function recordDailyVisit(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    const data: StreakData = raw ? JSON.parse(raw) : { dates: [] };
    const today = todayISO();
    if (!data.dates.includes(today)) {
      data.dates.push(today);
      data.dates.sort();
      localStorage.setItem(STREAK_KEY, JSON.stringify(data));
    }
  } catch {}
}

export function getStreak(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return 0;
    const data: StreakData = JSON.parse(raw);
    if (data.dates.length === 0) return 0;

    const sorted = [...data.dates].sort().reverse(); // most recent first
    let streak = 0;
    let check = todayISO();

    for (const d of sorted) {
      if (d === check) {
        streak++;
        // Move check back one day
        const prev = new Date(check);
        prev.setDate(prev.getDate() - 1);
        check = prev.toISOString().slice(0, 10);
      } else if (d < check) {
        break;
      }
    }
    return streak;
  } catch {
    return 0;
  }
}

export function getAchievements(): string[] {
  if (typeof window === "undefined") return [];
  const progress = loadProgress();
  const mastered = [...progress.values()].filter((p) => p.mastered).length;
  const streak = getStreak();
  const known = loadKnown().size;
  const achievements: string[] = [];

  if (streak >= 7)  achievements.push("7-day streak 🔥");
  if (streak >= 3)  achievements.push("3-day streak");
  if (mastered >= 50) achievements.push("50 cards mastered");
  if (mastered >= 20) achievements.push("20 cards mastered");
  if (mastered >= 5)  achievements.push("5 cards mastered");
  if (known >= 30)  achievements.push("30 cards known");
  if (known >= 10)  achievements.push("10 cards known");

  return achievements;
}
