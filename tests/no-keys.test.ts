import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, test } from "vitest";
import { findKey, scanForKeys } from "../scripts/no-keys.mjs";

// Built at run time so this file never holds anything shaped like a real key.
const fake = (prefix: string, length: number) => prefix + "x".repeat(length);

describe("no AI key ships with the app", () => {
  test("recognises each provider's key shape", () => {
    expect(findKey(fake("sk-ant-", 30))).not.toBeNull();
    expect(findKey(fake("sk-or-v1-", 30))).not.toBeNull();
    expect(findKey(fake("sk-proj-", 40))).not.toBeNull();
    expect(findKey(fake("AIza", 35))).not.toBeNull();
  });

  test("ignores variable names and empty settings", () => {
    expect(findKey("process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY")).toBeNull();
    expect(findKey('apiKey: apiKey || "no-key"')).toBeNull();
    expect(findKey("OPENROUTER_API_KEY=")).toBeNull();
  });

  test("flags settings files and keys in a build, but not third-party code", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "no-keys-"));
    fs.mkdirSync(path.join(dir, "server"));
    fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(dir, "server", "page.js"), "const ok = 1;");
    expect(scanForKeys(dir)).toEqual([]);

    fs.writeFileSync(path.join(dir, "node_modules", "pkg", "doc.js"), `// e.g. ${fake("sk-ant-", 30)}`);
    expect(scanForKeys(dir)).toEqual([]);

    fs.writeFileSync(path.join(dir, ".env.local"), "OPENROUTER_API_KEY=");
    fs.writeFileSync(path.join(dir, "server", "chunk.js"), `const k = "${fake("sk-or-v1-", 30)}";`);
    const problems = scanForKeys(dir);
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toMatch(/\.env\.local: settings file must not ship/);
    expect(problems.join("\n")).toMatch(/chunk\.js: looks like an API key/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
