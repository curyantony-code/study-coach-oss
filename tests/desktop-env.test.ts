import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const { parseEnv, readEnvFile } = createRequire(import.meta.url)("../desktop/env-file.cjs") as {
  parseEnv: (text: string) => Record<string, string>;
  readEnvFile: (file: string) => Record<string, string>;
};

describe("the desktop app's settings file", () => {
  it("reads KEY=VALUE lines, ignoring comments, blanks and lines without a key", () => {
    expect(parseEnv("# keys\nA_KEY=abc\n\n  B = two words \n=nokey\nnot a pair\nC=\"quoted=value\"")).toEqual({ A_KEY: "abc", B: "two words", C: "quoted=value" });
  });

  it("treats a missing file as no settings", () => {
    expect(readEnvFile("/definitely/not/here.env")).toEqual({});
  });
});
