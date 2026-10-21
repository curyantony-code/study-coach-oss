import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findVaults, searchRoots, vaultSigns } from "@/lib/vault/discover";

let home: string;
const make = (...parts: string[]) => fs.mkdirSync(path.join(home, ...parts), { recursive: true });
beforeEach(() => { home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sc-discover-"))); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

describe("vaultSigns", () => {
  it("recognises a vault by study.yml, .obsidian, or wiki + raw", () => {
    expect(vaultSigns([], ["study.yml"])).toBe("has a study.yml");
    expect(vaultSigns([".obsidian"], [])).toBe("an Obsidian vault");
    expect(vaultSigns(["wiki", "raw"], [])).toBe("has wiki and raw folders");
    expect(vaultSigns(["wiki"], ["notes.md"])).toBeNull();
  });
});

describe("searchRoots", () => {
  it("uses the top folder each known vault lives in, never the home folder", () => {
    expect(searchRoots(["/home/me/Brains/School/fall/FINA", "/home/me/Brains/School/COMM"], "/home/me")).toEqual(["/home/me/Brains"]);
    expect(searchRoots(["/home/me/Vault"], "/home/me")).toEqual([]);
    expect(searchRoots(["/Volumes/Disk/Notes/FINA"], "/home/me")).toEqual(["/Volumes/Disk/Notes"]);
  });
});

describe("findVaults", () => {
  it("finds vaults at any depth, skips ones already added, and does not look inside wiki or raw", () => {
    make("Brains", "School", "FINA", "wiki");
    make("Brains", "School", "FINA", "raw", "inner", ".obsidian");
    make("Brains", "School", "optimized", "FINA", "wiki");
    make("Brains", "School", "optimized", "FINA", "raw");
    make("Brains", "School", "MARK", ".obsidian");
    make("Brains", "Photos", "2026");
    const found = findVaults([path.join(home, "Brains")], [path.join(home, "Brains", "School", "MARK")]);
    expect(found.map((v) => path.relative(home, v.path))).toEqual(["Brains/School/FINA", "Brains/School/optimized/FINA"]);
    expect(found[1]).toMatchObject({ name: "FINA", inside: "optimized", because: "has wiki and raw folders" });
  });

  it("never offers the search root itself, and copes with a missing root", () => {
    make("Brains", ".obsidian");
    expect(findVaults([path.join(home, "Brains"), path.join(home, "nope")], [])).toEqual([]);
  });
});
