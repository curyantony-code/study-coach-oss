import { describe, expect, test } from "vitest";
import { cloudHosted, rankSmallModels } from "@/lib/ai/local-models";

const installed = [
  { name: "gemma3:27b-cloud", size: 0, parameterSize: "27000000000" },
  { name: "qwen3:30b", size: 18.6e9, parameterSize: "30.5B" },
  { name: "qwen3-coder:30b", size: 18.6e9, parameterSize: "30.5B" },
  { name: "llama3:latest", size: 4.7e9, parameterSize: "8.0B" },
  { name: "gemma3:4b", size: 3.3e9, parameterSize: "4.3B" },
  { name: "phi3:mini", size: 2.2e9, parameterSize: "3.8B" },
  { name: "gemma3:1b", size: 0.8e9, parameterSize: "999.89M" },
  { name: "mystery-big", size: 6e9 },
  { name: "mystery-small", size: 1.5e9 },
  { name: "nomic-embed-text", size: 0.3e9, parameterSize: "137M" },
];

describe("rankSmallModels", () => {
  test("only models of 4B parameters or fewer are ever picked: never 30B, 8B, a cloud entry, a coder or an embedder", () => {
    // Largest allowed first. A model that does not state its size counts only when its file is small.
    expect(rankSmallModels(installed)).toEqual(["phi3:mini", "gemma3:1b", "mystery-small"]);
  });

  test("the owner's named model goes first only if it is small enough", () => {
    expect(rankSmallModels(installed, "gemma3:1b")[0]).toBe("gemma3:1b");
    for (const tooBig of ["qwen3:30b", "llama3:latest", "gemma3:4b"]) expect(rankSmallModels(installed, tooBig)[0]).toBe("phi3:mini");
  });

  test("gives nothing when no small model is installed", () => {
    expect(rankSmallModels(installed.filter((m) => m.size > 4e9 || m.size === 0))).toEqual([]);
  });
});

describe("cloudHosted", () => {
  test("picks Ollama's cloud entries and leaves local and code models out", () => {
    const models = [
      { name: "llama3:latest", size: 4.7e9, parameterSize: "8.0B" },
      { name: "qwen3:30b", size: 18.6e9, parameterSize: "30.5B" },
      { name: "gpt-oss:120b-cloud", size: 0, parameterSize: "120B" },
      { name: "qwen3-coder:480b-cloud", size: 0, parameterSize: "480B" },
    ];
    expect(cloudHosted(models)).toEqual(["gpt-oss:120b-cloud"]);
  });
});
