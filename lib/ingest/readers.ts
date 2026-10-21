// Text readers: given a picture, where is the text in it? The Mac's own reader is the most
// accurate we tested and is used when present; Tesseract is the fallback on other systems.
// Both run on this computer. Nothing is sent anywhere.
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import type { Box } from "./boxes";

const READ_TIMEOUT_MS = 60_000;
const MAX_OUTPUT = 8 * 1024 * 1024;
const HEADER_BYTES = 256 * 1024;

export type ReaderName = "mac" | "tesseract";

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // Arguments are a list, never a shell string, so a file name cannot be run as a command.
    execFile(command, args, { timeout: READ_TIMEOUT_MS, maxBuffer: MAX_OUTPUT }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}

/** The Mac reader prints one box per line: x, y, width, height (0 to 1, from the top left), then the text. */
export function parseBoxLines(output: string): Box[] {
  return output.split("\n").flatMap((line) => {
    const parts = line.split("\t");
    if (parts.length < 5) return [];
    const [x, y, w, h] = parts.slice(0, 4).map(Number);
    const text = parts.slice(4).join(" ").trim();
    return [x, y, w, h].every(Number.isFinite) && text ? [{ x, y, w, h, text }] : [];
  });
}

/**
 * Tesseract reports single words in pixels. Words on a line are joined into one box unless
 * the space between them is wide, which is how the cells of a table row stay apart.
 */
export function parseTesseractTsv(tsv: string, width: number, height: number): Box[] {
  if (!(width > 0) || !(height > 0)) return [];
  const [header, ...lines] = tsv.split("\n");
  const names = header.split("\t");
  const at = (name: string) => names.indexOf(name);
  const words = lines.flatMap((line) => {
    const c = line.split("\t");
    if (c.length < names.length || c[at("level")] !== "5" || Number(c[at("conf")]) < 0) return [];
    const text = c.slice(at("text")).join(" ").trim();
    return text ? [{ key: `${c[at("block_num")]}.${c[at("par_num")]}.${c[at("line_num")]}`, left: Number(c[at("left")]), top: Number(c[at("top")]), w: Number(c[at("width")]), h: Number(c[at("height")]), text }] : [];
  });
  const byLine = new Map<string, typeof words>();
  for (const word of words) byLine.set(word.key, [...(byLine.get(word.key) ?? []), word]);

  const boxes: Box[] = [];
  const emit = (cell: typeof words) => {
    const left = cell[0].left;
    const top = Math.min(...cell.map((w) => w.top));
    const right = Math.max(...cell.map((w) => w.left + w.w));
    const bottom = Math.max(...cell.map((w) => w.top + w.h));
    const box = { x: left / width, y: top / height, w: (right - left) / width, h: (bottom - top) / height, text: cell.map((w) => w.text).join(" ") };
    if ([box.x, box.y, box.w, box.h].every(Number.isFinite)) boxes.push(box);
  };
  for (const line of byLine.values()) {
    const sorted = [...line].sort((a, b) => a.left - b.left);
    let cell = [sorted[0]];
    for (const word of sorted.slice(1)) {
      const previous = cell[cell.length - 1];
      if (word.left - (previous.left + previous.w) > 1.2 * Math.max(previous.h, word.h)) {
        emit(cell);
        cell = [word];
      } else {
        cell.push(word);
      }
    }
    emit(cell);
  }
  return boxes;
}

/** PNG and JPEG keep their size in the first bytes: read it without decoding the picture. */
export function pictureSize(file: string): { width: number; height: number } | null {
  // The size sits near the start of the file: the rest is not read.
  const data = Buffer.alloc(HEADER_BYTES);
  const handle = fs.openSync(file, "r");
  let length: number;
  try {
    length = fs.readSync(handle, data, 0, HEADER_BYTES, 0);
  } finally {
    fs.closeSync(handle);
  }
  return sizeFromHeader(data.subarray(0, length));
}

/** The width and height in a PNG or JPEG header, or null when they cannot be found. */
export function sizeFromHeader(data: Buffer): { width: number; height: number } | null {
  const real = (size: { width: number; height: number }) => (size.width > 0 && size.height > 0 ? size : null);
  if (data.length > 24 && data.toString("latin1", 1, 4) === "PNG") return real({ width: data.readUInt32BE(16), height: data.readUInt32BE(20) });
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let at = 2;
    while (at + 9 < data.length) {
      if (data[at] !== 0xff) return null;
      const marker = data[at + 1];
      const length = data.readUInt16BE(at + 2);
      // Start-of-frame markers carry the size; the others are skipped.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return real({ width: data.readUInt16BE(at + 7), height: data.readUInt16BE(at + 5) });
      at += 2 + length;
    }
  }
  return null;
}

function macReaderPath(): string | null {
  const candidates = [process.env.STUDY_READER_BIN, path.join(process.cwd(), "native", "bin", "mac-text-reader")];
  return candidates.find((file): file is string => Boolean(file) && fs.existsSync(file!)) ?? null;
}

let tesseractWorks: boolean | null = null;

async function hasTesseract(): Promise<boolean> {
  if (tesseractWorks === null) tesseractWorks = await run("tesseract", ["--version"]).then(() => true, () => false);
  return tesseractWorks;
}

/** Which reader this computer has, best first; null when it has none. */
export async function availableReader(): Promise<ReaderName | null> {
  if (process.platform === "darwin" && macReaderPath()) return "mac";
  return (await hasTesseract()) ? "tesseract" : null;
}

/** The text in a picture and where it sits. An unreadable picture gives no boxes, never an error. */
export async function readBoxes(file: string): Promise<{ boxes: Box[]; reader: ReaderName | null }> {
  let reader = await availableReader();
  if (reader === "mac") {
    try {
      return { boxes: parseBoxLines(await run(macReaderPath()!, [file])), reader };
    } catch (error) {
      // The Mac reader could not run (built for another kind of Mac, say): Tesseract is tried instead.
      console.error(`The Mac text reader failed on ${path.basename(file)}`, error);
      reader = (await hasTesseract()) ? "tesseract" : null;
    }
  }
  if (reader === "tesseract") {
    try {
      const size = pictureSize(file);
      // "Sparse text" mode (psm 11) finds text scattered over a slide or a spreadsheet; the default misses much of it.
      if (size) return { boxes: parseTesseractTsv(await run("tesseract", [file, "stdout", "--psm", "11", "tsv"]), size.width, size.height), reader };
    } catch (error) {
      console.error(`Reading the text in ${path.basename(file)} failed`, error);
    }
  }
  return { boxes: [], reader };
}
