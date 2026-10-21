import { describe, expect, test } from "vitest";
import { parseAiJsonArray } from "@/lib/ai/json";

describe("parseAiJsonArray", () => {
  test("reads an array wrapped in prose", () => {
    expect(parseAiJsonArray('Here you go:\n[{"a":1}]\nDone.')).toEqual([{ a: 1 }]);
  });

  test("keeps LaTeX intact, including commands that look like JSON escapes", () => {
    const reply = String.raw`[{"stem":"If $\sigma_P = 12\%$ and $\beta = 1.2$, find $\frac{E(r)-r_f}{\sigma}$ using \text{CAPM} and $\rho$, $\tau$, $\nu$."}]`;
    const [row] = parseAiJsonArray(reply) as { stem: string }[];
    expect(row.stem).toBe(String.raw`If $\sigma_P = 12\%$ and $\beta = 1.2$, find $\frac{E(r)-r_f}{\sigma}$ using \text{CAPM} and $\rho$, $\tau$, $\nu$.`);
  });

  test("real escapes still work", () => {
    const [row] = parseAiJsonArray(String.raw`[{"stem":"Line one\nLine two \"quoted\" and a tab\t1"}]`) as { stem: string }[];
    expect(row.stem).toBe('Line one\nLine two "quoted" and a tab\t1');
  });

  test("LaTeX that was already escaped properly is not doubled", () => {
    const [row] = parseAiJsonArray(String.raw`[{"stem":"$\\sigma^2$"}]`) as { stem: string }[];
    expect(row.stem).toBe(String.raw`$\sigma^2$`);
  });

  test("handles longer commands and brackets in the surrounding prose", () => {
    const stem = String.raw`$\neg p$, $\bigl(\tan x\bigr)$, $\textbf{x}$, $\rightarrow$`;
    const reply = "Here are [2] questions:\n" + String.raw`[{"stem":"` + stem + String.raw`"}]`;
    const [row] = parseAiJsonArray(reply) as { stem: string }[];
    expect(row.stem).toBe(stem);
  });

  test("finds the answer after thinking text that has brackets of its own", () => {
    const reply = 'We need an array like [{"stem": ...}] with 2 items [see rules].\nFinal answer:\n[{"stem":"Q1"},{"stem":"Q2"}]';
    expect(parseAiJsonArray(reply)).toEqual([{ stem: "Q1" }, { stem: "Q2" }]);
  });

  test("gives an empty list for replies with no usable array", () => {
    expect(parseAiJsonArray("User Safety: safe")).toEqual([]);
    expect(parseAiJsonArray('[{"stem": "cut off')).toEqual([]);
    expect(parseAiJsonArray("")).toEqual([]);
  });
});
