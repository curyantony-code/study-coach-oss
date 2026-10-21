import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, test } from "vitest";
import { buildIndex } from "@/lib/vault/build";
import { listMarkdownFiles } from "@/lib/vault/files";
import { parseWikilink } from "@/lib/vault/links";
import { parseManifest } from "@/lib/vault/manifest";
import { checkVaultPath } from "@/lib/vault/registry";

function indexNotes(notes: Record<string, string>) {
  return buildIndex({ vaultName: "t", paths: Object.keys(notes), read: (p) => notes[p], manifestText: null });
}

describe("unreadable content", () => {
  test("a folder that cannot be opened is skipped and reported, not fatal", () => {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), "sc-vault-"));
    fs.writeFileSync(path.join(vault, "ok.md"), "# ok");
    const locked = path.join(vault, "locked");
    fs.mkdirSync(locked);
    fs.writeFileSync(path.join(locked, "secret.md"), "# no");
    fs.chmodSync(locked, 0o000);
    const skipped: string[] = [];
    try {
      expect(listMarkdownFiles(vault, (p) => skipped.push(p)).map((f) => f.path)).toEqual(["ok.md"]);
      expect(skipped).toEqual(["locked"]);
    } finally {
      fs.chmodSync(locked, 0o755);
    }
  });

  test("a note that disappears before it is read becomes a warning", () => {
    const index = buildIndex({
      vaultName: "t",
      paths: ["a.md", "gone.md"],
      read: (p) => {
        if (p === "gone.md") throw new Error("ENOENT");
        return "- Term:: a definition";
      },
      manifestText: null,
    });
    expect(index.nodes.map((n) => n.id)).toEqual(["a.md"]);
    expect(index.warnings).toContain("Could not read gone.md.");
  });
});

describe("generic card rules: edge cases", () => {
  test("tables work with Windows line endings", () => {
    const index = indexNotes({ "a.md": "| Term | Def |\r\n|---|---|\r\n| Osmosis | Water moving |\r\n" });
    expect(index.cards.map((c) => [c.front, c.back])).toEqual([["Term: Osmosis", "Def: Water moving"]]);
  });

  test("an escaped pipe stays inside its table cell", () => {
    const index = indexNotes({ "a.md": "| Term | Def |\n|---|---|\n| Link | see [[Foo\\|bar]] now |\n" });
    expect(index.cards[0].back).toBe("Def: see [[Foo|bar]] now");
  });

  test("a Q/A answer stops at the next heading or list", () => {
    const index = indexNotes({ "a.md": "Q: What is x?\nA: the answer\nstill the answer\n## Next\ntext\n" });
    expect(index.cards.find((c) => c.type === "qa")?.back).toBe("the answer\nstill the answer");
  });
});

test("block references point at the note, not a missing one", () => {
  expect(parseWikilink("Note^abc123")).toEqual({ target: "Note", alias: null, heading: null });
  expect(parseWikilink("Note#Heading^abc|Shown")).toEqual({ target: "Note", alias: "Shown", heading: "Heading" });
  expect(parseWikilink("#^abc123")).toEqual({ target: "", alias: null, heading: null });
  // A caret inside a heading's formula is part of the heading.
  expect(parseWikilink(String.raw`#Variance $\sigma^2$`).heading).toBe(String.raw`Variance $\sigma^2$`);
});

test("unit names that only differ in spelling are caught as duplicates", () => {
  const result = parseManifest("course: { name: X }\nunits: [{ id: wk3, label: A }, { id: other, label: B, aliases: [Week 3] }]");
  expect(result.ok).toBe(false);
});

test("assessments may refer to a unit by another spelling of its name", () => {
  const result = parseManifest("course: { name: X }\nunits: [{ id: wk3, label: A }]\nassessments: [{ id: a, label: A, covers: [week3] }]");
  expect(result.ok).toBe(true);
});

test("the whole disk or home folder cannot be added as a vault", () => {
  expect(checkVaultPath("/")).toMatchObject({ ok: false });
  expect(checkVaultPath("~")).toMatchObject({ ok: false });
});

import Anthropic from "@anthropic-ai/sdk";
import { describeClaudeError, isClaudeModel } from "@/lib/ai/claude-tutor";
import { dailyTokenLimitForModel, DAILY_TOKEN_LIMIT_CLOUD, DAILY_TOKEN_LIMIT_OLLAMA, isLocalModel } from "@/lib/token-limits";

describe("AI provider routing", () => {
  test("tells Claude, OpenRouter and local model ids apart", () => {
    expect(isClaudeModel("claude-opus-5-5")).toBe(true);
    expect(isClaudeModel("llama3.2")).toBe(false);
    expect(isClaudeModel(undefined)).toBe(false);
    expect(isLocalModel("llama3.2")).toBe(true);
    expect(isLocalModel("claude-opus-5-5")).toBe(false);
    expect(isLocalModel("meta-llama/llama-3.1-8b-instruct:free")).toBe(false);
    expect(isLocalModel(undefined)).toBe(false);
  });

  test("only local models get the large daily budget", () => {
    expect(dailyTokenLimitForModel("llama3.2")).toBe(DAILY_TOKEN_LIMIT_OLLAMA);
    expect(dailyTokenLimitForModel("claude-opus-5-5")).toBe(DAILY_TOKEN_LIMIT_CLOUD);
    expect(dailyTokenLimitForModel(undefined)).toBe(DAILY_TOKEN_LIMIT_CLOUD);
  });

  test("explains API failures in plain words", () => {
    const apiError = (status: number) => Anthropic.APIError.generate(status, undefined, "boom", new Headers());
    expect(describeClaudeError(apiError(401))).toMatch(/API key was not accepted/);
    expect(describeClaudeError(apiError(429))).toMatch(/rate-limited/);
    expect(describeClaudeError(apiError(404))).toMatch(/MODEL_MAIN/);
    expect(describeClaudeError(apiError(500))).toMatch(/returned an error \(500\)/);
    expect(describeClaudeError(new Anthropic.APIConnectionError({ message: "offline" }))).toMatch(/Could not reach/);
    expect(describeClaudeError(new Error("x"))).toMatch(/Something went wrong/);
  });
});

import { explainSystemPrompt, firstTurn } from "@/lib/ai/explain";

describe("ask AI about a highlight", () => {
  test("the prompt grounds the answer in the note and asks for LaTeX", () => {
    const prompt = explainSystemPrompt("FIN 101", 'Node 2 "Portfolio"', "As $n$ grows…");
    expect(prompt).toContain("course notes for FIN 101");
    expect(prompt).toContain("<note title=\"Node 2 'Portfolio'\">\nAs $n$ grows…\n</note>");
    expect(prompt).toMatch(/LaTeX with dollar signs/);
    expect(prompt).toMatch(/If the note does not cover/);
  });

  test("the first message carries the highlight and the question, with a default", () => {
    expect(firstTurn("  $x^2$ ", "")).toBe("I highlighted this in the note:\n\n<highlight>\n$x^2$\n</highlight>\n\nExplain this so it makes sense to me.");
    expect(firstTurn("text", " Why? ")).toContain("</highlight>\n\nWhy?");
  });
});
