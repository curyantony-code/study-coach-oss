import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkFolder, datedName, expired } from "@/lib/backup/auto";
import { checkBackup, restoreInto, summarise, writeSnapshot } from "@/lib/backup/snapshot";
import { openDb } from "@/lib/db/client";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-backup-test-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function seeded(file: string, vaultName: string, settings: Record<string, string> = {}) {
  const db = openDb(file);
  db.prepare("INSERT INTO vaults (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(vaultName, vaultName, `/vaults/${vaultName}`, "2026-01-01");
  for (const [key, value] of Object.entries(settings)) db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, value);
  return db;
}

describe("snapshots", () => {
  it("writes a complete copy that passes the check", () => {
    const db = seeded(path.join(dir, "live.db"), "FINA", { "schedule:FINA": "{}" });
    const file = path.join(dir, "out", "copy.db");
    writeSnapshot(db, file);
    expect(fs.existsSync(`${file}.partial`)).toBe(false);
    expect(checkBackup(file)).toEqual({ ok: true, summary: { vaults: 1, answers: 0, lastAnswer: null } });
    db.close();
  });

  it("refuses files that are not a Study Coach backup", () => {
    const text = path.join(dir, "notes.db");
    fs.writeFileSync(text, "just some text, long enough to read a header from");
    expect(checkBackup(text).ok).toBe(false);
    expect(checkBackup(path.join(dir, "missing.db")).ok).toBe(false);
  });
});

describe("restoreInto", () => {
  it("replaces the data with the backup's, and keeps this computer's backup settings", () => {
    const old = seeded(path.join(dir, "old.db"), "FINA", { "schedule:FINA": "kept-from-backup", "backup:folder": "/other/computer" });
    const file = path.join(dir, "backup.db");
    writeSnapshot(old, file);
    old.close();

    const live = seeded(path.join(dir, "live.db"), "MARK", { "backup:folder": "/this/computer", "schedule:MARK": "gone" });
    expect(restoreInto(live, file)).toMatchObject({ vaults: 1 });
    const names = (live.prepare("SELECT name FROM vaults").all() as { name: string }[]).map((r) => r.name);
    expect(names).toEqual(["FINA"]);
    const setting = (key: string) => (live.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value;
    expect(setting("schedule:FINA")).toBe("kept-from-backup");
    expect(setting("schedule:MARK")).toBeUndefined();
    expect(setting("backup:folder")).toBe("/this/computer");
    expect(summarise(live).vaults).toBe(1);
    live.close();
  });

  it("changes nothing when the backup cannot be read", () => {
    const live = seeded(path.join(dir, "live.db"), "MARK");
    const bad = path.join(dir, "bad.db");
    fs.writeFileSync(bad, "not a database at all");
    expect(() => restoreInto(live, bad)).toThrow();
    expect(summarise(live).vaults).toBe(1);
    live.close();
  });
});

describe("automatic copies", () => {
  it("keeps the newest dated copies and leaves other files alone", () => {
    const names = ["Study Coach backup (latest).db", "holiday.jpg", ...["01", "02", "03", "04"].map((d) => datedName(`2026-10-${d}`))];
    expect(expired(names, 2)).toEqual([datedName("2026-10-02"), datedName("2026-10-01")]);
  });

  it("accepts a real folder outside the vaults and the app's data", () => {
    expect(checkFolder(dir, ["/vaults/FINA"], "/app/data")).toEqual({ ok: true, folder: dir });
    expect(checkFolder("relative/folder", [], "/app/data").ok).toBe(false);
    expect(checkFolder(path.join(dir, "nope"), [], "/app/data").ok).toBe(false);
    expect(checkFolder(dir, [path.dirname(dir)], "/app/data").ok).toBe(false);
    expect(checkFolder(dir, [], dir).ok).toBe(false);
    expect(checkFolder("", [], "/app/data").ok).toBe(false);
  });
});
