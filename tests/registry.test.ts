import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, test } from "vitest";
import { openDb, type Db } from "@/lib/db/client";
import { toFlashcards } from "@/lib/flashcards";
import { filterByGlobs, listMarkdownFiles, vaultSignature } from "@/lib/vault/files";
import { extractLinkTargets, parseWikilink } from "@/lib/vault/links";
import { listObsidianVaults } from "@/lib/vault/obsidian";
import {
  addVault, checkVaultPath, findVaultByPath, getSetting, getVault, listVaults,
  markIndexed, removeVault, setSetting, setWriteEnabled,
} from "@/lib/vault/registry";
import { normalizeUnitKey, parseCourseArc } from "@/lib/vault/units";
import { fixturePath, indexFixture } from "./helpers";

describe("vault registry", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  test("adds a vault read-only, named after its folder", () => {
    const vault = addVault(db, "/tmp/My Vault");
    expect(vault).toMatchObject({ name: "My Vault", path: "/tmp/My Vault", writeEnabled: false, style: "generic", lastIndexedAt: null });
    expect(listVaults(db)).toEqual([vault]);
    expect(findVaultByPath(db, "/tmp/My Vault")).toEqual(vault);
  });

  test("returns the existing entry when the same folder is added twice", () => {
    const first = addVault(db, "/tmp/a");
    expect(addVault(db, "/tmp/a", "Other name").id).toBe(first.id);
    expect(listVaults(db)).toHaveLength(1);
  });

  test("toggles writing, records indexing and removes vaults", () => {
    const vault = addVault(db, "/tmp/a");
    setWriteEnabled(db, vault.id, true);
    markIndexed(db, vault.id, "wiki-schema");
    expect(getVault(db, vault.id)).toMatchObject({ writeEnabled: true, style: "wiki-schema" });
    expect(getVault(db, vault.id)!.lastIndexedAt).not.toBeNull();
    removeVault(db, vault.id);
    expect(getVault(db, vault.id)).toBeNull();
  });

  test("stores settings", () => {
    expect(getSetting(db, "k")).toBeNull();
    setSetting(db, "k", "1");
    setSetting(db, "k", "2");
    expect(getSetting(db, "k")).toBe("2");
  });
});

describe("checkVaultPath", () => {
  test("accepts a real folder, with quotes or a trailing space", () => {
    const real = fs.realpathSync(fixturePath("generic-vault"));
    expect(checkVaultPath(` "${fixturePath("generic-vault")}" `)).toEqual({ ok: true, path: real });
  });

  test("expands ~ to the home folder", () => {
    const result = checkVaultPath("~/definitely-not-a-real-folder-xyz");
    expect(result).toEqual({ ok: false, error: `That folder does not exist: ${path.join(os.homedir(), "definitely-not-a-real-folder-xyz")}` });
  });

  test.each([
    ["", /Paste the folder path/],
    ["notes/vault", /full path/],
    ["/definitely/not/here", /does not exist/],
    [path.join(fixturePath("generic-vault"), "Loose.md"), /a file, not a folder/],
  ])("rejects %j", (input, message) => {
    const result = checkVaultPath(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });
});

describe("listObsidianVaults", () => {
  test("lists vault folders that still exist", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-obsidian-"));
    const config = path.join(dir, "obsidian.json");
    const existing = fixturePath("generic-vault");
    fs.writeFileSync(config, JSON.stringify({ vaults: { a: { path: existing }, b: { path: "/gone/vault" } } }));
    expect(listObsidianVaults(config)).toEqual([{ name: "generic-vault", path: existing }]);
  });

  test("returns nothing when Obsidian is not installed or its file is unreadable", () => {
    expect(listObsidianVaults("/no/such/obsidian.json")).toEqual([]);
  });
});

describe("files", () => {
  test("skips hidden folders, drafts and app code", () => {
    const paths = listMarkdownFiles(fixturePath("wiki-vault")).map((f) => f.path);
    expect(paths).toContain("raw/lecture-slides.md");
    expect(paths.some((p) => p.startsWith("study-app/") || p.startsWith(".obsidian/"))).toBe(false);
  });

  test("filters by include and exclude globs", () => {
    const paths = ["wiki/a.md", "wiki/log.md", "raw/b.md"];
    expect(filterByGlobs(paths, ["wiki/**"], ["wiki/log.md"])).toEqual(["wiki/a.md"]);
    expect(filterByGlobs(paths, undefined, [])).toEqual(paths);
  });

  test("signature changes when a file changes", () => {
    const vaultPath = fixturePath("generic-vault");
    const files = listMarkdownFiles(vaultPath);
    const touched = files.map((f, i) => (i === 0 ? { ...f, mtimeMs: f.mtimeMs + 1 } : f));
    expect(vaultSignature(vaultPath, touched)).not.toBe(vaultSignature(vaultPath, files));
  });
});

describe("small parsers", () => {
  test.each([
    ["wk3", "wk3", "Week 3"],
    ["Week 03", "wk3", "Week 3"],
    ["ch-9", "ch9", "Chapter 9"],
    ["Chapter 12", "ch12", "Chapter 12"],
    ["module_2", "mod2", "Module 2"],
    ["lec4", "lec4", "Lecture 4"],
  ])("normalizeUnitKey(%j) → %s", (raw, id, label) => {
    expect(normalizeUnitKey(raw)).toEqual({ id, label });
  });

  test("normalizeUnitKey ignores ordinary tags", () => {
    expect(normalizeUnitKey("motivation")).toBeNull();
    expect(normalizeUnitKey("practice-midterm1")).toBeNull();
  });

  test("parseCourseArc reads week rows", () => {
    const arc = parseCourseArc("intro\n## Course Arc (Weekly Topics)\n| Week | Topic |\n|---|---|\n| 1 | Intro |\n| 6 | *(Midterm)* |\n## Next\n| 9 | no |");
    expect([...arc]).toEqual([["wk1", "Week 1 — Intro"], ["wk6", "Week 6 — (Midterm)"]]);
  });

  test("parseWikilink splits target, heading and alias", () => {
    expect(parseWikilink("Note#Heading|Shown")).toEqual({ target: "Note", alias: "Shown", heading: "Heading" });
    expect(parseWikilink("folder/Note")).toEqual({ target: "folder/Note", alias: null, heading: null });
    expect(parseWikilink("#Same Note Section")).toEqual({ target: "", alias: null, heading: "Same Note Section" });
    expect(parseWikilink("Node 1#Ch5-P7 Mean\\|Ch5-P7")).toEqual({ target: "Node 1", alias: "Ch5-P7", heading: "Ch5-P7 Mean" });
  });

  test("extractLinkTargets ignores code, embeds of files and heading-only links", () => {
    expect(extractLinkTargets("[[A]] ![[pic.png]] [[#top]] [[A|again]]\n```\n[[InCode]]\n```")).toEqual(["A"]);
  });

  test("toFlashcards keeps the shape the study modes expect", () => {
    const cards = toFlashcards(indexFixture("wiki-vault"));
    expect(cards.find((c) => c.front === "Human capital")).toEqual({
      id: expect.any(String), front: "Human capital", back: "knowledge, skills and abilities people bring",
      source: "sources/wk1-intro", tags: ["intro", "strategy"], type: "exam-tip", week: "wk1",
    });
  });
});
