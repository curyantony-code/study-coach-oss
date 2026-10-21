// The colour theme, remembered in a cookie so the server can draw the page in the right
// colours from the first byte. No script has to run before the page appears.

export type ThemeChoice = "system" | "light" | "dark";
export type ThemeShown = "light" | "dark";

export interface Theme {
  /** What the student picked. */
  choice: ThemeChoice;
  /** What is on screen: for "system", what the computer was set to when last seen. */
  shown: ThemeShown;
}

export const THEME_COOKIE = "sc_theme";
export const DEFAULT_THEME: Theme = { choice: "system", shown: "light" };

/** Reads "choice:shown" (for example "system:dark"). Anything else gives the default. */
export function parseTheme(value: string | null | undefined): Theme {
  const [choice, shown] = (value ?? "").split(":");
  if ((choice !== "system" && choice !== "light" && choice !== "dark") || (shown !== "light" && shown !== "dark")) return DEFAULT_THEME;
  // A fixed choice is always shown as itself, whatever the cookie claims.
  return { choice, shown: choice === "system" ? shown : choice };
}

export function serialiseTheme(theme: Theme): string {
  return `${theme.choice}:${theme.choice === "system" ? theme.shown : theme.choice}`;
}

/** What to show for a choice, given whether the computer is in dark mode. */
export function resolveTheme(choice: ThemeChoice, computerIsDark: boolean): Theme {
  return { choice, shown: choice === "system" ? (computerIsDark ? "dark" : "light") : choice };
}
