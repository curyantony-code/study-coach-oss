// Reads a PDF from a vault page by page: its real text, and the text, tables and diagrams
// inside its pictures. Results go to the app's database; diagrams are saved as pictures in
// the app's data folder. The vault is only ever read.
import { execFile } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { getDb } from "../db/client";
import { PdfToolMissingError } from "../problems/import";
import type { Vault } from "../vault/registry";
import { coverage, figureCrop, ICON_COVERAGE, isScan, listedCoverage, pageMarkdown, parseLayout, planPage, readPicture, type PageLayout, type PagePicture, type PictureContent } from "./layout";
import { availableReader, readBoxes, type ReaderName } from "./readers";
import { donePages, forgetDoc, getDoc, saveDoc, savePage } from "./store";

const TOOL_TIMEOUT_MS = 120_000;
const MAX_XML = 40 * 1024 * 1024;
/** Pages read per request, so progress shows and a long PDF can be stopped part-way. */
export const PAGES_PER_ROUND = 4;
const MAX_PICTURES_PER_PAGE = 12;
/** Sharp enough to read small print, small enough to read quickly. */
const SCAN_DPI = 170;
/** A picture file this small holds a flat shape, not a photo or a chart. */
const BLANK_PICTURE_BYTES = 3000;
const FIGURE_DPI = 130;
/** No drawn page is made larger than this on its long side, however big the PDF says the page is. */
const MAX_DRAWN_PIXELS = 2400;
const MAX_PAGES = 5000;
const ROUND_BUDGET_MS = 90_000;
/** Earlier versions also saved .png figures; those are still served. */
const PICTURE_NAME = /^p\d{1,5}-\d{1,3}\.(jpg|png)$/;

function run(command: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: TOOL_TIMEOUT_MS, maxBuffer: MAX_XML, cwd }, (error, stdout) => {
      if (!error) return resolve(stdout);
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return reject(new PdfToolMissingError("Reading PDFs needs the free Poppler tools. In Terminal, run: brew install poppler"));
      reject(error);
    });
  });
}

/** A short, stable name for a PDF's folder of saved figures. */
export function docKey(file: string): string {
  return createHash("sha1").update(file).digest("hex").slice(0, 12);
}

function dataDir(): string {
  return path.dirname(process.env.STUDY_DB_PATH || path.join(process.cwd(), "data", "study.db"));
}

export function figureDir(vaultId: string, file: string): string {
  return path.join(dataDir(), "ingest", vaultId.replace(/[^\w-]/g, ""), docKey(file));
}

/** The saved picture for a figure, or null when the name is not one this app wrote. */
export function figurePath(vaultId: string, key: string, name: string): string | null {
  if (!/^[0-9a-f]{12}$/.test(key) || !PICTURE_NAME.test(name)) return null;
  const file = path.join(dataDir(), "ingest", vaultId.replace(/[^\w-]/g, ""), key, name);
  return fs.existsSync(file) ? file : null;
}

async function pageCount(pdf: string): Promise<number> {
  const pages = (await run("pdfinfo", [pdf])).match(/^Pages:\s+(\d+)/m)?.[1];
  if (!pages) throw new Error("The PDF's page count could not be read.");
  return Number(pages);
}

/** The sharpness to draw a page at: the wanted one, lowered for a poster-sized page so the picture stays a sane size. */
export function drawDpi(layout: Pick<PageLayout, "width" | "height">, wanted: number): number {
  // The layout measures a page at 108 units to the inch.
  const longSideInches = Math.max(layout.width, layout.height) / 108;
  return Math.max(10, Math.min(wanted, Math.floor(MAX_DRAWN_PIXELS / Math.max(longSideInches, 0.1))));
}

async function cropFigure(pdf: string, page: number, layout: PageLayout, picture: PagePicture, target: string): Promise<void> {
  const dpi = drawDpi(layout, FIGURE_DPI);
  const crop = figureCrop(layout, picture, dpi);
  const base = target.replace(/\.jpg$/, "");
  await run("pdftoppm", ["-jpeg", "-r", String(dpi), "-f", String(page), "-l", String(page), "-x", String(crop.x), "-y", String(crop.y), "-W", String(crop.width), "-H", String(crop.height), "-singlefile", pdf, base]);
  if (!fs.existsSync(target)) throw new Error("The figure was not drawn.");
}

interface PageResult {
  markdown: string;
  method: string;
}

/** Reads one page. Works in a throwaway folder; only figures worth keeping are copied out. */
async function readPage(pdf: string, page: number, figures: string): Promise<PageResult> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "study-coach-page-"));
  try {
    const range = ["-f", String(page), "-l", String(page)];
    // First the text alone, which is quick whatever the page holds.
    await run("pdftohtml", ["-xml", "-i", "-q", "-nodrm", ...range, pdf, path.join(work, "t")]);
    const textOnly: PageLayout = parseLayout(fs.readFileSync(path.join(work, "t.xml"), "utf-8"))[0] ?? { number: page, width: 918, height: 1188, items: [] };
    const coverages = listedCoverage(await run("pdfimages", ["-list", ...range, pdf]), textOnly);

    try {
      return await withPictures(pdf, page, figures, work, range, textOnly, coverages);
    } catch (error) {
      if (error instanceof PdfToolMissingError) throw error;
      // The pictures could not be read (too many, too large, a tool gave up): the page's own text is still worth having.
      console.error(`Reading the pictures on page ${page} failed; keeping its text`, error);
      const text = pageMarkdown(textOnly, new Map());
      if (!text.trim()) throw error;
      return { markdown: text, method: "text" };
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

async function withPictures(pdf: string, page: number, figures: string, work: string, range: string[], textOnly: PageLayout, coverages: number[]): Promise<PageResult> {
  let layout: PageLayout;
  let wanted: PagePicture[];
  let scanned = false;
  if (isScan(textOnly, coverages) || (textOnly.items.length === 0 && coverages.length === 0)) {
    // A scanned page is stored as stacked image layers that mean nothing apart, and are slow
    // to pull out: draw the page and read it whole.
    await run("pdftoppm", ["-jpeg", "-r", String(drawDpi(textOnly, SCAN_DPI)), ...range, "-singlefile", pdf, path.join(work, "scan")]);
    const whole: PagePicture = { kind: "picture", top: 0, left: 0, width: textOnly.width, height: textOnly.height, src: "scan.jpg" };
    layout = { ...textOnly, items: [whole] };
    wanted = [whole];
    scanned = true;
  } else if (coverages.length === 0) {
    layout = textOnly;
    wanted = [];
  } else {
    // Pictures among real text: extract them, with their places on the page.
    await run("pdftohtml", ["-xml", "-q", "-nodrm", ...range, pdf, path.join(work, "p")]);
    const full = parseLayout(fs.readFileSync(path.join(work, "p.xml"), "utf-8"))[0] ?? textOnly;
    const plan = planPage(full);
    wanted = plan.mode === "pictures" ? plan.keep : [];
    const keep = new Set(wanted);
    layout = { ...full, items: full.items.filter((item) => item.kind === "text" || keep.has(item)) };
  }

  const pictures = new Map<string, PictureContent>();
  let reader: ReaderName | null = null;
  let index = 0;
  // When a page has more pictures than are read, the largest ones are the ones kept.
  const chosen = [...wanted].sort((a, b) => b.width * b.height - a.width * a.height).slice(0, MAX_PICTURES_PER_PAGE);
  for (const item of wanted.filter((picture) => chosen.includes(picture))) {
    const source = path.join(work, path.basename(item.src));
    if (!fs.existsSync(source)) continue;
    const read = await readBoxes(source);
    reader = read.reader ?? reader;
    // A picture with no text in it that is small, or a flat block of colour, is decoration, not content.
    if (read.boxes.length === 0 && (coverage(layout, item) < ICON_COVERAGE || fs.statSync(source).size < BLANK_PICTURE_BYTES)) continue;
    const name = `p${page}-${++index}.jpg`;
    const content = readPicture(read.boxes, name);
    if (content.kind === "figure") {
      fs.mkdirSync(figures, { recursive: true });
      // Saved from the drawn page, a little wider than the picture, so axes and labels drawn around it are kept.
      const saved = scanned ? false : await cropFigure(pdf, page, layout, item, path.join(figures, name)).then(() => true, () => false);
      if (!saved) fs.copyFileSync(source, path.join(figures, name));
    }
    pictures.set(item.src, content);
  }
  const method = pictures.size === 0 ? "text" : reader ?? "pictures";
  return { markdown: pageMarkdown(layout, pictures), method };
}

export interface IngestProgress {
  total: number;
  done: number;
  /** The reader used for pictures on this computer, or null when there is none. */
  reader: ReaderName | null;
  error?: string;
}

const inFlight = new Map<string, Promise<IngestProgress>>();

async function round(vault: Vault, file: string): Promise<IngestProgress> {
  const db = getDb();
  const pdf = path.join(vault.path, file);
  const reader = await availableReader();
  const info = fs.statSync(pdf);
  const stamp = `${info.size}:${Math.round(info.mtimeMs)}`;
  const known = getDoc(db, vault.id, file);
  // A PDF that was replaced since it was read (new slides under the same name) is read afresh.
  if (known && known.stamp !== null && known.stamp !== stamp) {
    forgetDoc(db, vault.id, file);
    removeFigures(vault.id, file);
  }
  let total = known && (known.stamp === null || known.stamp === stamp) ? known.pages : 0;
  if (!total || known?.stamp == null) {
    total = Math.min(total || (await pageCount(pdf)), MAX_PAGES);
    saveDoc(db, vault.id, file, total, stamp, new Date());
  }
  const done = donePages(db, vault.id, file);
  const next: number[] = [];
  for (let page = 1; page <= total && next.length < PAGES_PER_ROUND; page++) if (!done.has(page)) next.push(page);
  const started = Date.now();
  for (const page of next) {
    // A slow document gives the page back to the student between rounds rather than holding one request open.
    if (Date.now() - started > ROUND_BUDGET_MS) break;
    try {
      const result = await readPage(pdf, page, figureDir(vault.id, file));
      savePage(db, vault.id, file, { page, ...result }, new Date());
    } catch (error) {
      if (error instanceof PdfToolMissingError) return { total, done: done.size, reader, error: error.message };
      console.error(`Reading page ${page} of ${file} failed`, error);
      // A page that cannot be read is recorded as such, so the rest of the PDF still gets read.
      savePage(db, vault.id, file, { page, markdown: "*This page could not be read.*", method: "failed" }, new Date());
    }
    done.add(page);
  }
  return { total, done: done.size, reader };
}

/** Reads the next few pages of a PDF. Two requests for the same PDF share one round. */
export function ingestNext(vault: Vault, file: string): Promise<IngestProgress> {
  const key = `${vault.id}:${file}`;
  const running = inFlight.get(key);
  if (running) return running;
  const work = round(vault, file).finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}

export function removeFigures(vaultId: string, file: string): void {
  fs.rmSync(figureDir(vaultId, file), { recursive: true, force: true });
}
