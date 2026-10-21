import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, parseTheme, resolveTheme, serialiseTheme } from "@/lib/theme";

describe("the theme cookie", () => {
  it("round-trips a choice and what is shown", () => {
    for (const value of ["system:dark", "system:light", "dark:dark", "light:light"]) expect(serialiseTheme(parseTheme(value))).toBe(value);
  });

  it("shows a fixed choice as itself, whatever else the cookie says", () => {
    expect(parseTheme("dark:light")).toEqual({ choice: "dark", shown: "dark" });
    expect(serialiseTheme({ choice: "light", shown: "dark" })).toBe("light:light");
  });

  it("falls back to the default for anything it does not recognise", () => {
    for (const value of [undefined, null, "", "dark", "purple:dark", "system:purple", "dark\"><script>"]) expect(parseTheme(value)).toEqual(DEFAULT_THEME);
  });

  it("follows the computer only when asked to", () => {
    expect(resolveTheme("system", true)).toEqual({ choice: "system", shown: "dark" });
    expect(resolveTheme("system", false).shown).toBe("light");
    expect(resolveTheme("light", true).shown).toBe("light");
  });
});
