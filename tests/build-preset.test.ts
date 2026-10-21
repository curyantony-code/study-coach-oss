import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The database path is read when the database is first opened, so it is set before anything is imported.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-preset-"));
process.env.STUDY_DB_PATH = path.join(dir, "study.db");
process.env.OLLAMA_BASE_URL = "http://127.0.0.1:9/v1";
delete process.env.OPENROUTER_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

describe("files added for a named course", () => {
  let service: typeof import("@/lib/build/service");
  let store: typeof import("@/lib/build/store");
  let db: import("@/lib/db/client").Db;

  beforeAll(async () => {
    service = await import("@/lib/build/service");
    store = await import("@/lib/build/store");
    db = (await import("@/lib/db/client")).getDb();
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const add = (id: string, name: string, text: string) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, text);
    store.addInboxFile(db, { id, name, path: file, origin: "upload", folder: "", bytes: text.length }, new Date());
  };

  it("reads an outline at once, naming the course from its text", async () => {
    add("o", "syllabus fall.txt", "School of Business\nCourse Name:   Introduction to Finance\nCourse Number: FIN 101 Section A\nFIN 101 meets Thursdays.");
    store.presetTags(db, "o", { kind: "outline" });
    await service.tagNow("o");
    expect(store.getInboxFile(db, "o")).toMatchObject({ status: "tagged", course: "FIN 101", kind: "outline", title: "Introduction to Finance", fixed: { course: false, kind: true } });
  });

  it("keeps the course the student chose, even when the file names another or none", async () => {
    add("a", "week 3 slides.txt", "MKTG 201 MKTG 201 Marketing Research\nSurveys");
    add("b", "Bodie_SM_Ch07.txt", "Answers to the chapter problems");
    store.presetTags(db, "a", { course: "FIN 101" });
    store.presetTags(db, "b", { course: "FIN 101" });
    expect(await service.tagRound()).toEqual({ total: 3, done: 3 });
    expect(store.getInboxFile(db, "a")).toMatchObject({ course: "FIN 101", kind: "slides", unit: { key: "wk3" } });
    expect(store.getInboxFile(db, "b")).toMatchObject({ course: "FIN 101", kind: "solutions", unit: { key: "ch7" } });
  });

  it("still keeps them when everything is tagged again", async () => {
    store.resetTags(db);
    await service.tagRound();
    expect(store.getInboxFile(db, "o")).toMatchObject({ course: "FIN 101", kind: "outline" });
    expect(store.getInboxFile(db, "a")?.course).toBe("FIN 101");
  });
});
