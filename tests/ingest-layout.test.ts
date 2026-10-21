import { describe, expect, it } from "vitest";
import { figureCrop, isScan, listedCoverage, pageMarkdown, paragraphText, parseLayout, plain, planPage, readPicture, tableMarkdown, type PageLayout, type PictureContent } from "@/lib/ingest/layout";
import { parseBoxLines, parseTesseractTsv, sizeFromHeader } from "@/lib/ingest/readers";
import { docKey, drawDpi, figurePath } from "@/lib/ingest/service";

const XML = `<?xml version="1.0"?>
<pdf2xml producer="poppler">
<page number="17" position="absolute" top="0" left="0" height="1188" width="918">
	<fontspec id="0" size="21" family="Cambria" color="#000000"/>
	<fontspec id="2" size="17" family="Times" color="#000000"/>
	<fontspec id="3" size="26" family="Times" color="#000000"/>
<image top="145" left="110" width="702" height="412" src="out-17_1.jpg"/>
<image top="649" left="110" width="702" height="356" src="out-17_2.jpg"/>
<image top="20" left="20" width="12" height="12" src="bullet.png"/>
<text top="1090" left="428" width="67" height="25" font="0">~ 16 ~ </text>
<text top="60" left="108" width="300" height="28" font="3">Decision <b>trees</b></text>
<text top="109" left="108" width="189" height="18" font="2">Example of a Decision Tree </text>
<text top="576" left="108" width="4" height="18" font="2"> </text>
<text top="613" left="108" width="250" height="18" font="2">Example: Solar &amp; Electric costs $100 </text>
<text top="1020" left="108" width="250" height="18" font="2">It lasts one year</text>
<text top="1040" left="108" width="250" height="18" font="2">and then ends.</text>
</page>
</pdf2xml>`;

describe("parseLayout", () => {
  const [page] = parseLayout(XML);

  it("reads text lines and pictures with their positions, skipping blanks and tiny pictures", () => {
    expect(page).toMatchObject({ number: 17, width: 918, height: 1188 });
    expect(page.items.filter((i) => i.kind === "picture").map((i) => (i.kind === "picture" ? i.src : ""))).toEqual(["out-17_1.jpg", "out-17_2.jpg"]);
    expect(page.items.filter((i) => i.kind === "text")).toHaveLength(6);
    expect(page.items.find((i) => i.kind === "text" && i.text.startsWith("Decision"))).toMatchObject({ text: "Decision trees", size: 26 });
  });

  it("copes with nonsense", () => {
    expect(parseLayout("not xml at all")).toEqual([]);
  });
});

describe("pageMarkdown", () => {
  const [page] = parseLayout(XML);
  const pictures = new Map<string, PictureContent>([
    ["out-17_1.jpg", { kind: "figure", labels: "Study finance · “A”", file: "p17-1.jpg" }],
    ["out-17_2.jpg", { kind: "text", paragraphs: ["- Discount rate is 15%."] }],
  ]);
  const markdown = pageMarkdown(page, pictures);

  it("writes the page top to bottom with pictures in their place", () => {
    expect(markdown.split("\n\n")).toEqual([
      "### Decision trees",
      "Example of a Decision Tree",
      "![Study finance · “A”](figure:p17-1.jpg)",
      "Example: Solar & Electric costs \\$100",
      "- Discount rate is 15%.",
      "It lasts one year and then ends.",
    ]);
  });

  it("leaves the page number out", () => {
    expect(markdown).not.toMatch(/~ 16 ~/);
  });
});

describe("pictures and tables", () => {
  it("escapes money and bars so they are never read as formulas or columns", () => {
    expect(plain("costs $5 | \\$6")).toBe("costs \\$5 \\| \\$6");
    expect(tableMarkdown({ header: ["", "0", "1"], rows: [["Cost", "$5", ""]] })).toBe("|   | 0 | 1 |\n|---|---|---|\n| Cost | \\$5 |   |");
  });

  it("keeps a picture with no readable text as a figure", () => {
    expect(readPicture([], "p3-1.jpg")).toEqual({ kind: "figure", labels: "", file: "p3-1.jpg" });
  });
});

describe("reader output", () => {
  it("parses the Mac reader's lines and ignores broken ones", () => {
    expect(parseBoxLines("0.1\t0.2\t0.3\t0.04\tRevenue\nbroken line\n0.5\t0.2\t0.1\t0.04\t600,000\n")).toEqual([
      { x: 0.1, y: 0.2, w: 0.3, h: 0.04, text: "Revenue" },
      { x: 0.5, y: 0.2, w: 0.1, h: 0.04, text: "600,000" },
    ]);
  });

  it("joins Tesseract's words into cells, splitting at wide gaps", () => {
    const head = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
    const word = (n: number, left: number, text: string, conf = 95) => `5\t1\t1\t1\t1\t${n}\t${left}\t100\t60\t20\t${conf}\t${text}`;
    const tsv = [head, "4\t1\t1\t1\t1\t0\t0\t100\t900\t20\t-1\t", word(1, 100, "Change"), word(2, 170, "in"), word(3, 400, "40,000"), word(4, 700, "50,000")].join("\n");
    const boxes = parseTesseractTsv(tsv, 1000, 500);
    expect(boxes.map((b) => b.text)).toEqual(["Change in", "40,000", "50,000"]);
    expect(boxes[0]).toMatchObject({ x: 0.1, y: 0.2 });
  });
});

describe("saved figures", () => {
  it("names a PDF's folder stably and refuses names it did not write", () => {
    expect(docKey("raw/Notes/Topic 2.pdf")).toMatch(/^[0-9a-f]{12}$/);
    expect(docKey("raw/Notes/Topic 2.pdf")).toBe(docKey("raw/Notes/Topic 2.pdf"));
    expect(figurePath("vault", docKey("a.pdf"), "../../study.db")).toBeNull();
    expect(figurePath("vault", "../../../etc", "p1-1.jpg")).toBeNull();
    expect(figurePath("vault", docKey("a.pdf"), "p1-1.jpg")).toBeNull();
  });
});

describe("planPage", () => {
  const picture = (width: number, height: number, src = "a.png") => ({ kind: "picture" as const, top: 0, left: 0, width, height, src });
  const text = (value: string) => ({ kind: "text" as const, top: 10, left: 10, height: 12, size: 12, text: value });
  const page = (items: PageLayout["items"]): PageLayout => ({ number: 1, width: 1000, height: 1000, items });

  it("reads a page that is one big picture with no real text as a scan", () => {
    expect(planPage(page([picture(1000, 980), picture(1000, 980, "mask.png")]))).toEqual({ mode: "scan" });
  });

  it("drops a slide's background but keeps its other pictures", () => {
    const chart = picture(500, 400, "chart.png");
    const plan = planPage(page([picture(1000, 1000, "background.png"), chart, text("Job analysis: three phases and six steps in all")]));
    expect(plan).toEqual({ mode: "pictures", keep: [chart] });
  });
});

describe("spotting a scan before extracting anything", () => {
  const LISTING = `page   num  type   width height color comp bpc  enc interp  object ID x-ppi y-ppi size ratio
--------------------------------------------------------------------------------------------
   1     0 image     872  1156  rgb     3   8  jpx    no        20  0   120   120 3299B 0.1%
   1     1 image    2617  3468  rgb     3   8  jpx    no        21  0   360   360 12.6K 0.0%
   1     2 smask    2617  3468  gray    1   1  jbig2  no        21  0   360   360 66.4K 6.0%`;
  const letter = { number: 1, width: 918, height: 1188, items: [] as PageLayout["items"] };

  it("works out how much of the page each picture covers, ignoring masks", () => {
    const covers = listedCoverage(LISTING, letter);
    expect(covers).toHaveLength(2);
    for (const c of covers) expect(c).toBeGreaterThan(0.7);
    expect(listedCoverage("no pictures here", letter)).toEqual([]);
  });

  it("calls a page-sized picture with no real text a scan, but not a slide with text on it", () => {
    const covers = listedCoverage(LISTING, letter);
    expect(isScan(letter, covers)).toBe(true);
    const slide = { ...letter, items: [{ kind: "text" as const, top: 1, left: 1, height: 12, size: 12, text: "Job analysis is the process of systematically obtaining information" }] };
    expect(isScan(slide, covers)).toBe(false);
    expect(isScan(letter, [0.2, 0.1])).toBe(false);
  });
});

describe("figureCrop", () => {
  const page = { width: 918, height: 1188 };
  const picture = { kind: "picture" as const, top: 145, left: 110, width: 702, height: 412, src: "a.jpg" };

  it("takes the picture with a margin, in pixels at the given sharpness", () => {
    const crop = figureCrop(page, picture, 108);
    expect(crop.x).toBeLessThan(110);
    expect(crop.y).toBeLessThan(145);
    expect(crop.width).toBeGreaterThan(702);
    expect(crop.height).toBeGreaterThan(412);
    // Twice as sharp is twice as many pixels, give or take rounding.
    expect(Math.abs(figureCrop(page, picture, 216).width - crop.width * 2)).toBeLessThanOrEqual(1);
  });

  it("never reaches outside the page", () => {
    const crop = figureCrop(page, { ...picture, left: 0, top: 0, width: 918, height: 1188 }, 108);
    expect(crop).toEqual({ x: 0, y: 0, width: 918, height: 1188 });
  });
});

describe("review fixes", () => {
  const page = (text: string) => `<page number="1" top="0" left="0" height="100" width="100"><fontspec id="0" size="12"/><text top="10" left="10" width="50" height="12" font="0">${text}</text></page>`;

  it("survives numbered characters that do not exist, and reads hex ones", () => {
    expect(parseLayout(page("A&#99999999;B &#x41;&#65; &#55296;"))[0].items[0]).toMatchObject({ text: "AB AA" });
  });

  it("does not let a PDF's own words pass for a figure, a table row or a heading", () => {
    for (const text of ["![x](figure:p1-1.jpg)", "### Not a heading", "| a | b |"]) {
      const out = paragraphText(text);
      expect(out.startsWith("!["), text).toBe(false);
      expect(out.startsWith("|"), text).toBe(false);
      expect(out.startsWith("#"), text).toBe(false);
    }
    expect(paragraphText("Discount rate is 15%.")).toBe("Discount rate is 15%.");
    const [layout] = parseLayout(page("![x](figure:p9-9.jpg)"));
    expect(pageMarkdown(layout, new Map())).not.toMatch(/^!\[/);
  });

  it("refuses picture sizes and reader boxes that make no sense", () => {
    const png = Buffer.alloc(32); png.write("\u0089PNG", 0, "latin1"); png.writeUInt32BE(640, 16); png.writeUInt32BE(480, 20);
    expect(sizeFromHeader(png)).toEqual({ width: 640, height: 480 });
    png.writeUInt32BE(0, 16);
    expect(sizeFromHeader(png)).toBeNull();
    expect(sizeFromHeader(Buffer.from("not a picture"))).toBeNull();
    expect(parseTesseractTsv("level\tblock_num\tpar_num\tline_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t5\t5\t90\tx", 0, 0)).toEqual([]);
  });

  it("draws a poster-sized page less sharply, never enormous", () => {
    expect(drawDpi({ width: 918, height: 1188 }, 170)).toBe(170);
    const poster = { width: 108 * 200, height: 108 * 200 };
    expect(drawDpi(poster, 170) * 200).toBeLessThanOrEqual(2400);
  });
});
