// A PDF page as an ordered list of what is on it: lines of real text and embedded pictures,
// each with its position. Read from Poppler's XML description of the page (pdftohtml -xml).
import { figureLabels, toParagraphs, toTable, classify, type Box, type PictureKind, type Table } from "./boxes";

export interface PageText {
  kind: "text";
  top: number;
  left: number;
  height: number;
  /** Font size, for telling headings from body text. */
  size: number;
  text: string;
}

export interface PagePicture {
  kind: "picture";
  top: number;
  left: number;
  width: number;
  height: number;
  /** File name of the extracted picture. */
  src: string;
}

export interface PageLayout {
  number: number;
  width: number;
  height: number;
  items: (PageText | PagePicture)[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
/** Pictures smaller than this (in page units) are bullets, rules and logos. */
const MIN_PICTURE_SIDE = 60;
const HEADING_RATIO = 1.25;
const PAGE_NUMBER = /^[~\-–—\s]*\d{1,4}[~\-–—\s]*$/;

/** A numbered character, or nothing when the number is not a real character (a broken font mapping). */
function codePoint(value: number): string {
  const real = Number.isInteger(value) && value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff);
  return real ? String.fromCodePoint(value) : "";
}

function decode(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => codePoint(code[0].toLowerCase() === "x" ? Number.parseInt(code.slice(1), 16) : Number(code)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ENTITIES[name]);
}

function attributes(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

/** Parses the XML for one or more pages. Unknown or malformed parts are skipped, never fatal. */
export function parseLayout(xml: string): PageLayout[] {
  const pages: PageLayout[] = [];
  for (const page of xml.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g)) {
    const head = attributes(page[1]);
    const body = page[2];
    const sizes = new Map([...body.matchAll(/<fontspec\b([^>]*)\/>/g)].map((m) => {
      const a = attributes(m[1]);
      return [a.id, Number(a.size) || 0] as const;
    }));
    const items: PageLayout["items"] = [];
    for (const m of body.matchAll(/<image\b([^>]*)\/>/g)) {
      const a = attributes(m[1]);
      const picture: PagePicture = { kind: "picture", top: Number(a.top), left: Number(a.left), width: Number(a.width), height: Number(a.height), src: a.src ?? "" };
      if (picture.src && picture.width >= MIN_PICTURE_SIDE && picture.height >= MIN_PICTURE_SIDE) items.push(picture);
    }
    for (const m of body.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
      const a = attributes(m[1]);
      const text = decode(m[2]).replace(/\s+/g, " ").trim();
      if (text) items.push({ kind: "text", top: Number(a.top), left: Number(a.left), height: Number(a.height), size: sizes.get(a.font) ?? 0, text });
    }
    pages.push({ number: Number(head.number) || pages.length + 1, width: Number(head.width) || 1, height: Number(head.height) || 1, items });
  }
  return pages;
}

/** A page with less real text than this, under a page-sized picture, is a scan. */
const SCAN_TEXT_LIMIT = 40;
const SCAN_COVERAGE = 0.7;
const BACKGROUND_COVERAGE = 0.85;
/** A picture smaller than this share of the page, with no text in it, is a logo or an icon. */
export const ICON_COVERAGE = 0.08;

/** Poppler's XML measures a page at 1.5 times its size in points. */
const XML_UNITS_PER_INCH = 72 * 1.5;

/**
 * The share of the page each embedded picture covers, from `pdfimages -list`. That listing
 * is quick even when the pictures are enormous, so a scan can be spotted before anything
 * is extracted. Masks and pictures with no stated resolution are left out.
 */
export function listedCoverage(listing: string, layout: Pick<PageLayout, "width" | "height">): number[] {
  return listing.split("\n").flatMap((line) => {
    const c = line.trim().split(/\s+/);
    if (c.length < 14 || c[2] !== "image") return [];
    const [width, height, xPpi, yPpi] = [Number(c[3]), Number(c[4]), Number(c[12]), Number(c[13])];
    if (![width, height, xPpi, yPpi].every((n) => Number.isFinite(n) && n > 0)) return [];
    return [((width / xPpi) * XML_UNITS_PER_INCH * (height / yPpi) * XML_UNITS_PER_INCH) / (layout.width * layout.height)];
  });
}

/** True for a page that is a picture of a page: a page-sized image and next to no real text. */
export function isScan(layout: PageLayout, coverages: number[]): boolean {
  const realText = layout.items.reduce((sum, item) => sum + (item.kind === "text" ? item.text.length : 0), 0);
  return realText < SCAN_TEXT_LIMIT && coverages.some((c) => c >= SCAN_COVERAGE);
}

export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The part of the drawn page to save for a figure, in pixels at `dpi`: the picture plus a
 * margin, because a chart's axes and labels are often drawn around the picture, not in it.
 */
export function figureCrop(layout: Pick<PageLayout, "width" | "height">, picture: PagePicture, dpi: number): Crop {
  const scale = dpi / XML_UNITS_PER_INCH;
  const marginX = layout.width * 0.1;
  const marginY = layout.height * 0.035;
  const left = Math.max(0, picture.left - marginX);
  const top = Math.max(0, picture.top - marginY);
  const right = Math.min(layout.width, picture.left + picture.width + marginX);
  const bottom = Math.min(layout.height, picture.top + picture.height + marginY);
  return { x: Math.round(left * scale), y: Math.round(top * scale), width: Math.max(1, Math.round((right - left) * scale)), height: Math.max(1, Math.round((bottom - top) * scale)) };
}

export type PagePlan = { mode: "scan" } | { mode: "pictures"; keep: PagePicture[] };

/** The share of the page a picture covers. */
export function coverage(layout: PageLayout, picture: PagePicture): number {
  return (picture.width * picture.height) / (layout.width * layout.height);
}

/**
 * How to treat a page's pictures. A page that is one big picture with no real text is a
 * scan and is read whole. On a page with real text, a picture that covers the whole page is
 * the slide's background and is left out.
 */
export function planPage(layout: PageLayout): PagePlan {
  const pictures = layout.items.filter((item): item is PagePicture => item.kind === "picture");
  const realText = layout.items.reduce((sum, item) => sum + (item.kind === "text" ? item.text.length : 0), 0);
  if (realText < SCAN_TEXT_LIMIT && pictures.some((p) => coverage(layout, p) >= SCAN_COVERAGE)) return { mode: "scan" };
  return { mode: "pictures", keep: pictures.filter((p) => coverage(layout, p) < BACKGROUND_COVERAGE) };
}

/** What a picture turned out to hold, ready to be written out. */
export type PictureContent =
  | { kind: "table"; table: Table }
  | { kind: "text"; paragraphs: string[] }
  | { kind: "figure"; labels: string; file: string };

export function readPicture(boxes: Box[], file: string): PictureContent {
  const kind: PictureKind = classify(boxes);
  if (kind === "table") return { kind, table: toTable(boxes)! };
  if (kind === "text") return { kind, paragraphs: toParagraphs(boxes) };
  return { kind: "figure", labels: figureLabels(boxes), file };
}

/** Money is written \$ in this app, so a dollar sign is never taken for the start of a formula. */
export function plain(text: string): string {
  return text.replace(/\\?\$/g, "\\$").replace(/\|/g, "\\|");
}

/**
 * A paragraph of the PDF's own words. Text that happens to start like this app's markup (a
 * figure line, a table row, a heading) gets an invisible character in front, so a PDF cannot
 * make the page show a figure or a heading that is not there.
 */
export function paragraphText(text: string): string {
  return plain(text).replace(/^(!\[|\\\||#{1,6}\s)/, "\u200b$1");
}

export function tableMarkdown(table: Table): string {
  const line = (cells: string[]) => `| ${cells.map((c) => plain(c) || " ").join(" | ")} |`;
  return [line(table.header), `|${table.header.map(() => "---").join("|")}|`, ...table.rows.map(line)].join("\n");
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * The page as Markdown, top to bottom. Real text keeps its paragraphs and headings; each
 * picture becomes a table, its text, or a figure line `![labels](figure:file)`.
 */
export function pageMarkdown(layout: PageLayout, pictures: Map<string, PictureContent>): string {
  const ordered = [...layout.items].sort((a, b) => a.top - b.top || a.left - b.left);
  const body = median(ordered.flatMap((item) => (item.kind === "text" && item.size > 0 ? [item.size] : [])));
  const blocks: string[] = [];
  let paragraph: { lines: string[]; bottom: number; heading: boolean } | null = null;
  const flush = () => {
    if (!paragraph) return;
    const text = paragraph.lines.join(" ");
    blocks.push(paragraph.heading ? `### ${plain(text)}` : paragraphText(text));
    paragraph = null;
  };

  for (const item of ordered) {
    if (item.kind === "picture") {
      flush();
      const content = pictures.get(item.src);
      if (!content) continue;
      if (content.kind === "table") blocks.push(tableMarkdown(content.table));
      else if (content.kind === "text") blocks.push(...content.paragraphs.map(paragraphText));
      else blocks.push(`![${plain(content.labels).replace(/[\[\]]/g, "") || "Figure"}](figure:${content.file})`);
      continue;
    }
    // A page number at the foot of the page is furniture, not content.
    if (item.top > layout.height * 0.88 && PAGE_NUMBER.test(item.text)) continue;
    const heading = body > 0 && item.size >= body * HEADING_RATIO && item.text.length <= 120;
    const sameLine = paragraph && Math.abs(item.top - (paragraph.bottom - item.height)) <= item.height * 0.5;
    const follows = paragraph && item.top - paragraph.bottom <= item.height * 0.7;
    if (paragraph && paragraph.heading === heading && (sameLine || follows)) {
      paragraph.lines.push(item.text);
      paragraph.bottom = Math.max(paragraph.bottom, item.top + item.height);
    } else {
      flush();
      paragraph = { lines: [item.text], bottom: item.top + item.height, heading };
    }
  }
  flush();
  return blocks.join("\n\n");
}
