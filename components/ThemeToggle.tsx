"use client";
import { useEffect, useState } from "react";
import { resolveTheme, serialiseTheme, THEME_COOKIE, type Theme, type ThemeChoice } from "@/lib/theme";

/** Where the choice was kept before it moved to a cookie; read once to carry it over. */
const LEGACY_KEY = "study-coach-theme";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemeChoice, string> = { system: "Match my computer", light: "Light", dark: "Dark" };
const ICON: Record<ThemeChoice, string> = { system: "💻", light: "☀️", dark: "🌙" };

const computerIsDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

function hasCookie(): boolean {
  return document.cookie.split("; ").some((pair) => pair.startsWith(`${THEME_COOKIE}=`));
}

/** Puts a theme on screen and remembers it, so the next page arrives already in these colours. */
function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme.shown;
  document.cookie = `${THEME_COOKIE}=${serialiseTheme(theme)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

function legacyChoice(): ThemeChoice | null {
  try {
    const value = localStorage.getItem(LEGACY_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

/** Cycles the colour theme: match the computer, light, dark. `initial` is the theme the server drew the page in. */
export default function ThemeToggle({ initial }: { initial: Theme }) {
  const [choice, setChoice] = useState<ThemeChoice>(initial.choice);

  useEffect(() => {
    // First visit since the choice moved to a cookie: carry the old one over, once.
    const carried = hasCookie() ? null : legacyChoice();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (carried && carried !== choice) setChoice(carried);
    const current = carried ?? choice;
    // "Match my computer" is only known in the browser: correct the page if the server guessed wrong.
    const settle = () => {
      const theme = resolveTheme(current, computerIsDark());
      if (document.documentElement.dataset.theme !== theme.shown || !hasCookie()) apply(theme);
    };
    settle();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", settle);
    return () => media.removeEventListener("change", settle);
  }, [choice]);

  const change = () => {
    const next = NEXT[choice];
    setChoice(next);
    apply(resolveTheme(next, computerIsDark()));
  };

  return (
    <button
      type="button"
      onClick={change}
      aria-label={`Colour theme: ${LABEL[choice]}. Press to change.`}
      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <span aria-hidden="true">{ICON[choice]}</span>
      <span>Theme: {LABEL[choice]}</span>
    </button>
  );
}
