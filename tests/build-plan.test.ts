import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { decodeXml, docxParagraphs, slideOrder, slideParagraphs } from "@/lib/build/extract";
import { appendChunk, filesUnder, isUploadId, plainFileName } from "@/lib/build/inbox";
import { checkModelTags } from "@/lib/build/model";
import { documentToMarkdown, furniture, pagesToMarkdown, safeText, splitFrontmatter } from "@/lib/build/notes";
import { courseNameIn, planCourse, safeName, withoutKeys, type BuildFile } from "@/lib/build/plan";
import { coursesFromNeighbours, knownCourses } from "@/lib/build/service";
import { checkBuildRoot, freeFolder, InsideVaultError, onDisk, writeVault } from "@/lib/build/write";
import { buildIndex } from "@/lib/vault/build";
import { parseManifest } from "@/lib/vault/manifest";

const temp: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-build-"));
  temp.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temp.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const file = (over: Partial<BuildFile> & Pick<BuildFile, "id" | "name" | "kind">): BuildFile => ({ unit: null, title: over.name, pages: [], ...over });

describe("reading Word and PowerPoint text", () => {
  it("joins the runs of a paragraph and decodes entities", () => {
    expect(docxParagraphs('<w:p><w:r><w:t>Risk &amp; </w:t></w:r><w:r><w:t xml:space="preserve">return</w:t></w:r></w:p><w:p><w:r><w:t> </w:t></w:r></w:p>')).toEqual(["Risk & return"]);
    expect(slideParagraphs("<a:p><a:r><a:t>The CAPM</a:t></a:r></a:p><a:p><a:endParaRPr/></a:p><a:p><a:r><a:t>Beta &gt; 1</a:t></a:r></a:p>")).toEqual(["The CAPM", "Beta > 1"]);
    expect(decodeXml("&#8364;5 &lt; &#x20AC; &#99999999; &amp;lt;")).toBe("€5 < € &#99999999; &lt;");
  });

  it("puts slides in the order they are shown, not the order they were made", () => {
    const presentation = '<p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst>';
    const rels = '<Relationship Id="rId2" Type="x" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="x" Target="slides/slide2.xml"/>';
    const files = ["ppt/slides/slide1.xml", "ppt/slides/slide2.xml", "ppt/slides/slide10.xml"];
    expect(slideOrder(presentation, rels, files)).toEqual(["ppt/slides/slide2.xml", "ppt/slides/slide1.xml", "ppt/slides/slide10.xml"]);
    expect(slideOrder("", "", ["ppt/slides/slide10.xml", "ppt/slides/slide2.xml"])).toEqual(["ppt/slides/slide2.xml", "ppt/slides/slide10.xml"]);
  });
});

describe("turning pages into a note", () => {
  it("makes one section per slide, with lists as lists and money safe from the maths drawer", () => {
    const markdown = pagesToMarkdown(["The CAPM\n• Prices only systematic risk\n• A bond costs $1,000", "12", "Beta\nSensitivity to the market."], "Slide");
    expect(markdown).toBe("## The CAPM\n\n- Prices only systematic risk\n- A bond costs \\$1,000\n\n## Beta\n\nSensitivity to the market.");
  });

  it("drops lines printed on most pages, title-only slides, and merges a continued slide", () => {
    const pages = ["Intro\nfirst point", "Part 1", "Topic A\nalpha", "Topic A (cont.)\nbeta", "Topic B\ngamma", "Topic C\ndelta"].map((page, at) => `${page}\n© School ${at + 1}`);
    const markdown = pagesToMarkdown(pages, "Slide");
    expect(markdown).not.toContain("School");
    expect(markdown).not.toContain("Part 1");
    expect(markdown).toContain("## Topic A\n\nalpha\nbeta");
  });

  it("names a slide without a title by its number and keeps headings unique", () => {
    const markdown = pagesToMarkdown(["- only a point.", "Recap\none", "Other\nx", "Recap\ntwo"], "Slide");
    expect(markdown).toContain("## Slide 1");
    expect(markdown).toContain("## Recap (2)");
  });

  it("finds which lines are furniture only when there are enough pages to tell", () => {
    expect(furniture([["a", "b"], ["a", "c"]]).size).toBe(0);
    expect([...furniture(Array.from({ length: 6 }, (_, at) => ["Page 1 of 9".replace("1", String(at)), `Example ${at}`]))]).toEqual(["Page # of #"]);
  });

  it("handles documents and the student's own notes", () => {
    expect(documentToMarkdown("Leverage\n\nBorrowing scales both.\n\n• one\n• two")).toBe("## Leverage\n\nBorrowing scales both.\n\n- one\n- two");
    expect(splitFrontmatter("---\ntags: [a]\n---\n# Mine\ntext")).toEqual({ frontmatter: "tags: [a]", body: "# Mine\ntext" });
    expect(safeText("# Why ? Because $5")).toBe("Why? Because \\$5");
  });
});

describe("courseNameIn", () => {
  it("reads the three ways outlines state the course name", () => {
    expect(courseNameIn("School of Business\nCourse Name:       Introduction to Finance\nCourse Number: FIN 101 Section A", "FIN 101")).toBe("Introduction to Finance");
    expect(courseNameIn("FIN 101 – Introduction to Finance\nFall 2026", "FIN 101")).toBe("Introduction to Finance");
    expect(courseNameIn("  MARKETING RESEARCH\n  MKTG 201 (Sec. B)\n", "MKTG 201")).toBe("Marketing Research");
    expect(courseNameIn("NORTHFIELD SCHOOL OF BUSINESS\nMKTG 401 A (Fall 2026)", "MKTG 401")).toBeNull();
    expect(courseNameIn("nothing here", "MKTG 401")).toBeNull();
  });
});

describe("planCourse", () => {
  const files: BuildFile[] = [
    file({ id: "o", name: "Syllabus.pdf", kind: "outline", pages: ["Course Name: Introduction to Finance\nFIN 101 Section A\nFall 2026"] }),
    file({ id: "s1", name: "FIN 101 - Node 2 - Portfolio Selection.pptx", kind: "slides", unit: { key: "node2", label: "Node 2" }, title: "Portfolio Selection", pages: ["Diversification\n• Spreads risk"] }),
    file({ id: "s1pdf", name: "FIN 101 - Node 2 - Portfolio Selection.pdf", kind: "slides", unit: { key: "node2", label: "Node 2" }, title: "Portfolio Selection", pages: ["Diversification\nSpreads risk"] }),
    file({ id: "s2", name: "wk10.pdf", kind: "slides", unit: { key: "node10", label: "Node 10" }, title: "Bonds", pages: ["Duration\nA measure"] }),
    file({ id: "n", name: "my notes.md", kind: "notes", title: "my notes", pages: ["---\ntags: [mine]\n---\n# My notes\n**Sharpe ratio**: excess return per unit of total risk."] }),
    file({ id: "p", name: "Set 1.pdf", kind: "problems" }),
    file({ id: "b", name: "Finance Basics 2nd Edition.pdf", kind: "textbook" }),
    file({ id: "scan", name: "scan.pdf", kind: "notes", pages: [" "] }),
  ];
  const plan = planCourse("FIN 101", files, files[0].pages.join("\n"));

  it("files every original under raw/, renaming only what the app finds by name", () => {
    expect(Object.fromEntries(plan.copies.map((copy) => [copy.id, copy.to]))).toMatchObject({
      o: "raw/Course Info/Syllabus.pdf",
      p: "raw/Practice & Solutions/Problem Set - Set 1.pdf",
      b: "raw/Textbook/Finance Basics 2nd Edition.pdf",
      s1: "raw/Slides/FIN 101 - Node 2 - Portfolio Selection.pptx",
      scan: "raw/Notes/scan.pdf",
    });
    expect(plan.copies).toHaveLength(files.length);
  });

  it("writes one note per deck or note, in unit folders in teaching order", () => {
    expect(plan.notes.map((note) => note.path)).toEqual([
      "wiki/Node 2 - Portfolio Selection/FIN 101 - Node 2 - Portfolio Selection.md",
      "wiki/Node 10 - Bonds/FIN 101 - Node 10 - Bonds.md",
      "wiki/General/FIN 101 - my notes.md",
      "FIN 101 - Sources.md",
    ]);
    expect(plan.units.map((unit) => unit.id)).toEqual(["node2", "node10", "general"]);
  });

  it("keeps a student's own note as written, adding only its unit", () => {
    const mine = plan.notes.find((note) => note.fromFile === "n")!.content;
    expect(mine).toContain('units: ["general"]');
    expect(mine).toContain("tags: [mine]");
    expect(mine).not.toContain("Made by Study Coach");
    expect(mine.match(/^# /gm)).toHaveLength(1);
  });

  it("produces a study.yml the app accepts, and notes it files under the right units", () => {
    const parsed = parseManifest(plan.manifest);
    expect(parsed.ok && parsed.manifest.course).toEqual({ name: "Introduction to Finance", code: "FIN 101", term: "Fall 2026", textbook: "Finance Basics 2nd Edition" });
    const byPath = new Map(plan.notes.map((note) => [note.path, note.content]));
    const index = buildIndex({ vaultName: "FIN 101", paths: [...byPath.keys()], read: (p) => byPath.get(p)!, manifestText: plan.manifest });
    expect(index.units.map((unit) => unit.id)).toEqual(["node2", "node10", "general"]);
    expect(index.nodes.find((node) => node.title.includes("Node 2"))?.unitIds).toEqual(["node2"]);
    expect(index.cards.some((card) => card.front.includes("Sharpe ratio"))).toBe(true);
    // The table of sources must not become flashcards.
    expect(index.cards.some((card) => card.front.includes(".pdf"))).toBe(false);
  });

  it("leaves a title shared by several units out of their names", () => {
    const shared = planCourse("BUS 100", [
      file({ id: "a", name: "wk1.pdf", kind: "slides", unit: { key: "wk1", label: "Week 1" }, title: "Working in Teams", pages: ["A\nb"] }),
      file({ id: "b", name: "wk2.pdf", kind: "slides", unit: { key: "wk2", label: "Week 2" }, title: "Working in Teams", pages: ["A\nb"] }),
    ]);
    expect(shared.notes.map((note) => note.path).slice(0, 2)).toEqual(["wiki/Week 1/BUS 100 - Week 1.md", "wiki/Week 2/BUS 100 - Week 2.md"]);
    expect(shared.courseName).toBe("BUS 100");
  });

  it("makes names safe for any computer", () => {
    expect(safeName('  Risk/Return: "CAPM"? [draft]. ')).toBe("Risk Return CAPM draft");
    expect(safeName("///")).toBe("Untitled");
    expect(safeName("con")).toBe("con file");
    expect(safeName("a\u0000b")).toBe("a b");
    expect(safeName(`${"x".repeat(119)}. tail`)).toBe("x".repeat(119));
    expect(Buffer.byteLength(safeName("漢".repeat(200)))).toBeLessThanOrEqual(180);
    expect(safeName("cafe\u0301")).toBe("caf\u00e9");
  });

  it("drops a property together with the lines under it", () => {
    expect(withoutKeys("units:\n  - ch1\n  - ch2\ntags: [a]\nsource: old\naliases:\n  - x", ["units", "title", "source"])).toEqual(["tags: [a]", "aliases:", "  - x"]);
  });
});

describe("writing a vault", () => {
  it("creates a new folder with the notes, study.yml and copies, leaving the originals alone", () => {
    const root = tempDir();
    const source = path.join(tempDir(), "deck.pdf");
    fs.writeFileSync(source, "pdf bytes");
    const plan = planCourse("TEST 101", [file({ id: "d", name: "deck.pdf", kind: "slides", pages: ["Topic\nbody"], title: "Deck" })]);
    const vault = writeVault(root, plan, new Map([["d", source]]));
    expect(vault).toBe(path.join(root, "TEST 101"));
    expect(fs.readFileSync(path.join(vault, "raw", "Slides", "deck.pdf"), "utf8")).toBe("pdf bytes");
    expect(fs.existsSync(path.join(vault, "study.yml"))).toBe(true);
    expect(fs.existsSync(path.join(vault, "wiki", "General", "TEST 101 - Deck.md"))).toBe(true);
    expect(fs.existsSync(source)).toBe(true);
    // A second build never writes into the first.
    expect(writeVault(root, plan, new Map([["d", source]]))).toBe(path.join(root, "TEST 101 (2)"));
  });

  it("removes the half-made folder when a file cannot be copied", () => {
    const root = tempDir();
    const plan = planCourse("TEST 101", [file({ id: "d", name: "deck.pdf", kind: "slides", pages: ["Topic\nbody"] })]);
    expect(() => writeVault(root, plan, new Map([["d", path.join(root, "missing.pdf")]]))).toThrow();
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("refuses to build inside an existing vault, however the place is spelled", () => {
    const vault = tempDir();
    const plan = planCourse("TEST 101", [file({ id: "d", name: "deck.pdf", kind: "slides", pages: ["Topic\nbody"] })]);
    expect(() => writeVault(path.join(vault, "New Courses"), plan, new Map(), [vault])).toThrow(InsideVaultError);
    expect(fs.readdirSync(vault)).toEqual([]);
    expect(checkBuildRoot(path.join(vault, "sub", "deeper"), [fs.realpathSync(vault)]).ok).toBe(false);
    expect(onDisk("/Users/Me/Documents", "darwin")).toBe(onDisk("/users/me/documents", "darwin"));
  });

  it("picks a free folder name and refuses unsafe places for new courses", () => {
    expect(freeFolder("/r", "FIN 101", (folder) => folder === path.join("/r", "FIN 101"))).toBe(path.join("/r", "FIN 101 (2)"));
    expect(checkBuildRoot("~/Documents/Courses", [], "/Users/me")).toEqual({ ok: true, path: "/Users/me/Documents/Courses" });
    expect(checkBuildRoot("~", [], "/Users/me").ok).toBe(false);
    expect(checkBuildRoot("relative/path", [], "/Users/me").ok).toBe(false);
    expect(checkBuildRoot("/Users/me/Vault/sub", ["/Users/me/Vault"], "/Users/me").ok).toBe(false);
    expect(checkBuildRoot("/Users/me/Vault-other", ["/Users/me/Vault"], "/Users/me").ok).toBe(true);
  });
});

describe("the inbox", () => {
  it("accepts only plain names of usable kinds", () => {
    expect(plainFileName("../../etc/Week 1.pdf")).toBe("Week 1.pdf");
    expect(plainFileName("C:\\Users\\me\\notes.md")).toBe("notes.md");
    expect(plainFileName("run.sh")).toBeNull();
    expect(plainFileName(`${"b".repeat(400)}.pdf`)).toBe(`${"b".repeat(200)}.pdf`);
    expect(plainFileName("..")).toBeNull();
    expect(isUploadId("../x")).toBe(false);
  });

  it("appends pieces in order and refuses one that is out of place", () => {
    const previous = process.env.STUDY_DB_PATH;
    process.env.STUDY_DB_PATH = path.join(tempDir(), "study.db");
    try {
      const id = "11111111-2222-3333-4444-555555555555";
      expect(appendChunk(id, "a.pdf", 0, Buffer.from("abc"))).toEqual({ ok: true, size: 3 });
      expect(appendChunk(id, "a.pdf", 0, Buffer.from("abc")).ok).toBe(false);
      expect(appendChunk(id, "a.pdf", 3, Buffer.from("de"))).toEqual({ ok: true, size: 5 });
    } finally {
      process.env.STUDY_DB_PATH = previous;
    }
  });

  it("lists the course files under a folder, skipping hidden folders, notes folders and housekeeping", () => {
    const root = tempDir();
    for (const name of ["FIN 101/raw/Week 1.pdf", "FIN 101/wiki/note.md", "FIN 101/README.md", ".obsidian/x.md", "movie.mp4", "empty.pdf"]) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), name === "empty.pdf" ? "" : "x");
    }
    expect(filesUnder(root).files.map((found) => [found.name, found.folder])).toEqual([["Week 1.pdf", "FIN 101/raw"]]);
  });
});

describe("checkModelTags", () => {
  const sample = "Chapter 7\nOptimal risky portfolios";
  it("keeps only what the file backs up", () => {
    expect(checkModelTags('Sure! {"kind":"slides","course":"FIN 101","unit":"Chapter 7","title":"Optimal Risky Portfolios"}', "x.pdf", sample, ["FIN 101"])).toEqual({
      kind: "slides", course: "FIN 101", unit: { key: "ch7", label: "Chapter 7" }, title: "Optimal Risky Portfolios",
    });
    // An invented course, a chapter that is not in the file, and "outline" are all dropped.
    expect(checkModelTags('{"kind":"outline","course":"ECON 201","unit":"Chapter 9","title":"Portfolios"}', "x.pdf", sample, [])).toEqual({ kind: null, course: null, unit: null, title: "Portfolios" });
  });

  it("rejects a reply that is not the asked-for shape", () => {
    expect(checkModelTags("I think it is slides", "x.pdf", sample, [])).toBeNull();
    expect(checkModelTags('{"kind":"poem"}', "x.pdf", sample, [])).toBeNull();
  });
});

describe("courses from neighbours", () => {
  const at = (id: string, course: string | null, filePath: string, origin: "folder" | "upload" = "folder") => ({ id, course, path: filePath, origin, status: "tagged" as const });

  it("follows the nearest folder whose files agree, and never guesses across a mixed folder", () => {
    const filled = coursesFromNeighbours([
      at("a", "FIN 101", "/s/FIN/raw/a.pdf"), at("b", "FIN 101", "/s/FIN/raw/b.pdf"), at("x", null, "/s/FIN/raw/sub/x.pdf"),
      at("m", "MKTG 201", "/s/mixed/m.pdf"), at("c", "BUS 100", "/s/mixed/c.pdf"), at("y", null, "/s/mixed/y.pdf"),
    ]);
    expect([...filled]).toEqual([["x", "FIN 101"]]);
  });

  it("leaves alone a file the student cleared on purpose", () => {
    expect(coursesFromNeighbours([at("a", "FIN 101", "/s/a.pdf"), { ...at("x", null, "/s/x.pdf"), how: "you" as const }]).size).toBe(0);
  });

  it("gives uploads the inbox's only course", () => {
    expect([...coursesFromNeighbours([at("a", "FIN 101", "/i/1/a.pdf", "upload"), at("x", null, "/i/2/x.pdf", "upload")])]).toEqual([["x", "FIN 101"]]);
  });

  it("collects the courses the student already has", () => {
    expect(knownCourses([{ name: "Bus 100 Teacher" }, { name: "Obsidian Vault" }], [{ course: "FIN 101" }, { course: null }])).toEqual(["BUS 100", "FIN 101"]);
  });
});
