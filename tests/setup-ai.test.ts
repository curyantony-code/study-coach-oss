import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, test } from "vitest";
import { checkKey } from "@/lib/ai/key-check";
import { cleanPasted, masked, parseSettings, saveSetting, settingsFilePath, shapeProblem, specFor, withSetting } from "@/lib/ai/settings-file";

// Built at run time so this file never holds anything shaped like a real key.
const OPENROUTER = "sk-or-v1-" + "a1".repeat(16);
const YOUTUBE = "AIza" + "b".repeat(35);
const ANTHROPIC = "sk-ant-api03-" + "c".repeat(30);

const answer = (status: number, body = "") => (async () => new Response(body, { status })) as unknown as typeof fetch;

describe("pasted keys", () => {
  test("are cleaned of spaces, quotes and a copied KEY= prefix", () => {
    expect(cleanPasted("OPENROUTER_API_KEY", `  "${OPENROUTER}" `)).toBe(OPENROUTER);
    expect(cleanPasted("OPENROUTER_API_KEY", `OPENROUTER_API_KEY=${OPENROUTER}`)).toBe(OPENROUTER);
  });

  test("are checked for the right provider before anything is sent", () => {
    const openrouter = specFor("OPENROUTER_API_KEY")!;
    expect(shapeProblem(openrouter, OPENROUTER)).toBeNull();
    expect(shapeProblem(openrouter, "")).toMatch(/Paste your key/);
    expect(shapeProblem(openrouter, YOUTUBE)).toMatch(/start with “sk-or-v1-”/);
    expect(shapeProblem(openrouter, "sk-or-v1-short")).toMatch(/complete/);
    expect(shapeProblem(specFor("YOUTUBE_API_KEY")!, YOUTUBE)).toBeNull();
    expect(shapeProblem(specFor("ANTHROPIC_API_KEY")!, ANTHROPIC)).toBeNull();
  });

  test("only ever show their last four characters", () => {
    expect(masked(OPENROUTER)).toBe("••••a1a1");
    expect(masked(OPENROUTER)).not.toContain("sk-or");
  });

  test("unknown key names are refused", () => {
    expect(specFor("PATH")).toBeNull();
    expect(specFor("NODE_OPTIONS")).toBeNull();
  });
});

describe("the settings file", () => {
  test("sets, replaces and removes one key, keeping every other line", () => {
    const start = "# my settings\nAI_MODEL=openrouter/free\n";
    const added = withSetting(start, "OPENROUTER_API_KEY", OPENROUTER);
    expect(added).toBe(`# my settings\nAI_MODEL=openrouter/free\nOPENROUTER_API_KEY=${OPENROUTER}\n`);
    const replaced = withSetting(`${added}OPENROUTER_API_KEY=old\n`, "OPENROUTER_API_KEY", "new");
    expect(replaced).toBe("# my settings\nAI_MODEL=openrouter/free\nOPENROUTER_API_KEY=new\n");
    expect(withSetting(replaced, "OPENROUTER_API_KEY", null)).toBe(start);
    expect(withSetting("", "YOUTUBE_API_KEY", YOUTUBE)).toBe(`YOUTUBE_API_KEY=${YOUTUBE}\n`);
    expect(withSetting(`YOUTUBE_API_KEY=${YOUTUBE}\n`, "YOUTUBE_API_KEY", null)).toBe("");
  });

  test("reads values, skipping comments and quotes", () => {
    expect(parseSettings(`# x\nA=1\nB="two"\n\nbad line\n`)).toEqual({ A: "1", B: "two" });
  });

  test("lives in the desktop app's data folder, .env.local from source, nowhere in Docker", () => {
    expect(settingsFilePath({ NODE_ENV: "production", STUDY_SETTINGS_FILE: "/data/settings.env" } as NodeJS.ProcessEnv, "/app")).toBe(path.resolve("/data/settings.env"));
    expect(settingsFilePath({ NODE_ENV: "development" } as NodeJS.ProcessEnv, "/app")).toBe(path.join("/app", ".env.local"));
    expect(settingsFilePath({ NODE_ENV: "production" } as NodeJS.ProcessEnv, "/app")).toBeNull();
  });

  describe("on disk", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "setup-ai-"));
    const file = path.join(dir, "nested", "settings.env");
    afterEach(() => delete process.env.YOUTUBE_API_KEY);

    test("saves a key, makes it live, and removes it again", () => {
      saveSetting(file, "YOUTUBE_API_KEY", YOUTUBE);
      expect(fs.readFileSync(file, "utf-8")).toBe(`YOUTUBE_API_KEY=${YOUTUBE}\n`);
      expect(process.env.YOUTUBE_API_KEY).toBe(YOUTUBE);
      if (process.platform !== "win32") expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      saveSetting(file, "YOUTUBE_API_KEY", null);
      expect(fs.readFileSync(file, "utf-8")).toBe("");
      expect(process.env.YOUTUBE_API_KEY).toBeUndefined();
      expect(fs.readdirSync(path.dirname(file))).toEqual(["settings.env"]);
    });
  });
});

describe("trying a key", () => {
  test("a key the provider accepts works", async () => {
    expect(await checkKey("OPENROUTER_API_KEY", OPENROUTER, answer(200))).toEqual({ status: "works" });
  });

  test("a rejected key is reported and not saved", async () => {
    expect((await checkKey("ANTHROPIC_API_KEY", ANTHROPIC, answer(401))).status).toBe("rejected");
    expect((await checkKey("YOUTUBE_API_KEY", YOUTUBE, answer(400, '{"error":{"reason":"keyInvalid"}}'))).status).toBe("rejected");
  });

  test("a YouTube key whose API is not switched on is saved with the next step", async () => {
    const result = await checkKey("YOUTUBE_API_KEY", YOUTUBE, answer(403, '{"error":{"status":"PERMISSION_DENIED","details":[{"reason":"SERVICE_DISABLED"}]}}'));
    expect(result.status).toBe("unknown");
    expect(result.status === "unknown" && result.message).toMatch(/Enable/);
  });

  test("no internet, a busy provider or no credit still saves the key", async () => {
    const offline = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect((await checkKey("OPENROUTER_API_KEY", OPENROUTER, offline)).status).toBe("unknown");
    expect((await checkKey("OPENROUTER_API_KEY", OPENROUTER, answer(429))).status).toBe("unknown");
    expect((await checkKey("ANTHROPIC_API_KEY", ANTHROPIC, answer(402))).status).toBe("unknown");
  });

  test("sends each key only to its own provider", async () => {
    const seen: string[] = [];
    const record = (async (url: string) => { seen.push(new URL(url).host); return new Response("", { status: 200 }); }) as unknown as typeof fetch;
    await checkKey("OPENROUTER_API_KEY", OPENROUTER, record);
    await checkKey("ANTHROPIC_API_KEY", ANTHROPIC, record);
    await checkKey("OPENAI_API_KEY", "sk-" + "d".repeat(40), record);
    await checkKey("YOUTUBE_API_KEY", YOUTUBE, record);
    expect(seen).toEqual(["openrouter.ai", "api.anthropic.com", "api.openai.com", "www.googleapis.com"]);
  });
});
