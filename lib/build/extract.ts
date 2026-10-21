// Gets the text out of an uploaded file, page by page. The file is only ever read.
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { extractPdfText, PdfToolMissingError } from "../problems/import";

const TOOL_TIMEOUT_MS = 60_000;
const MAX_XML_BYTES = 60 * 1024 * 1024;
const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_SLIDES = 400;

export interface Extracted {
  /** One entry per page or slide; a single entry for a file without pages. */
  pages: string[];
  /** Why there is no text, in the student's words, when there is none. */
  problem?: string;
}

export const READABLE = new Set([".pdf", ".md", ".markdown", ".txt", ".docx", ".pptx"]);

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: TOOL_TIMEOUT_MS, maxBuffer: MAX_XML_BYTES }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}

/** Reads one file out of a .docx or .pptx (both are zip archives) with the system's own tools. */
async function zipEntry(archive: string, entry: string): Promise<string> {
  try {
    return await run("unzip", ["-p", archive, entry]);
  } catch {
    // Windows has no unzip, but its tar reads zip archives.
    return run("tar", ["-xOf", archive, entry]);
  }
}

async function zipNames(archive: string): Promise<string[]> {
  try {
    return (await run("unzip", ["-Z1", archive])).split("\n").filter(Boolean);
  } catch {
    return (await run("tar", ["-tf", archive])).split("\n").map((line) => line.trim()).filter(Boolean);
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  const character = (whole: string, code: number) => (Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole);
  return text
    .replace(/&#x([0-9a-f]{1,6});/gi, (whole, hex: string) => character(whole, parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (whole, code: string) => character(whole, Number(code)))
    .replace(/&(lt|gt|quot|apos|amp);/g, (_, name: string) => ENTITIES[name]);
}

/** The paragraphs of a Word document's XML, one per line. */
export function docxParagraphs(xml: string): string[] {
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map(([paragraph]) => decodeXml([...paragraph.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br)\/>/g)].map((m) => (m[2] ? " " : m[1])).join("")).trim())
    .filter(Boolean);
}

/** The paragraphs of one PowerPoint slide's XML, in reading order. */
export function slideParagraphs(xml: string): string[] {
  return [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>|<a:p [^>]*>[\s\S]*?<\/a:p>/g)]
    .map(([paragraph]) => decodeXml([...paragraph.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join("")).trim())
    .filter(Boolean);
}

/**
 * The slides in the order they are shown. A deck's slide files are numbered in the order
 * they were made; the presentation's own list says where each one now sits.
 */
export function slideOrder(presentationXml: string, relsXml: string, slideFiles: string[]): string[] {
  const byNumber = [...slideFiles].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const targets = new Map([...relsXml.matchAll(/<Relationship\b[^>]*>/g)].flatMap(([tag]) => {
    const id = tag.match(/\bId="([^"]+)"/)?.[1];
    const target = tag.match(/\bTarget="([^"]+)"/)?.[1];
    return id && target ? [[id, `ppt/${target.replace(/^\/?(ppt\/)?/, "")}`] as [string, string]] : [];
  }));
  const shown = [...presentationXml.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].flatMap(([, id]) => targets.get(id) ?? []).filter((name) => slideFiles.includes(name));
  // Anything the list does not mention is kept, after the rest.
  return shown.length > 0 ? [...shown, ...byNumber.filter((name) => !shown.includes(name))] : byNumber;
}

async function pptxPages(file: string): Promise<string[]> {
  const names = await zipNames(file);
  const slideFiles = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  const [presentation, rels] = await Promise.all([zipEntry(file, "ppt/presentation.xml").catch(() => ""), zipEntry(file, "ppt/_rels/presentation.xml.rels").catch(() => "")]);
  const slides = slideOrder(presentation, rels, slideFiles).slice(0, MAX_SLIDES);
  const pages: string[] = [];
  for (const slide of slides) pages.push(slideParagraphs(await zipEntry(file, slide)).join("\n"));
  return pages;
}

/** The text of a file, or a plain reason there is none. Never throws for an unreadable file. */
export async function extractText(file: string): Promise<Extracted> {
  const extension = path.extname(file).toLowerCase();
  try {
    if (extension === ".pdf") {
      const pages = (await extractPdfText(file)).split("\f");
      if (pages.length > 1 && !pages[pages.length - 1].trim()) pages.pop();
      return pages.some((page) => page.trim()) ? { pages } : { pages, problem: "This PDF is a scan with no text in it. Once the course is built, use Read a PDF to read it." };
    }
    if (extension === ".md" || extension === ".markdown" || extension === ".txt") {
      if (fs.statSync(file).size > MAX_TEXT_FILE_BYTES) return { pages: [], problem: "This text file is too large to read." };
      return { pages: [fs.readFileSync(file, "utf8")] };
    }
    if (extension === ".docx") return { pages: [docxParagraphs(await zipEntry(file, "word/document.xml")).join("\n\n")] };
    if (extension === ".pptx") return { pages: await pptxPages(file) };
    return { pages: [], problem: "This kind of file is kept as it is; its text is not read." };
  } catch (error) {
    if (error instanceof PdfToolMissingError) return { pages: [], problem: error.message };
    console.error(`Reading ${path.basename(file)} failed`, error);
    return { pages: [], problem: "This file could not be read. It is kept as it is." };
  }
}

export interface Sample {
  /** The text of the first pages. */
  text: string;
  /** Pages or slides in the whole file; 0 for a file without pages. */
  pages: number;
  problem?: string;
}

/**
 * The first pages of a file and its page count, for tagging. A PDF is not read to the end
 * for this: a 900-page textbook would take minutes, and only its start is looked at.
 */
export async function sampleText(file: string, samplePages: number): Promise<Sample> {
  if (path.extname(file).toLowerCase() !== ".pdf") {
    const whole = await extractText(file);
    return { text: whole.pages.slice(0, samplePages).join("\n"), pages: whole.pages.length > 1 ? whole.pages.length : 0, problem: whole.problem };
  }
  try {
    const [text, info] = await Promise.all([
      run("pdftotext", ["-layout", "-enc", "UTF-8", "-l", String(samplePages), file, "-"]),
      run("pdfinfo", [file]),
    ]);
    const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
    return text.trim() ? { text, pages } : { text: "", pages, problem: "This PDF is a scan with no text in it. Once the course is built, use Read a PDF to read it." };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { text: "", pages: 0, problem: "Reading PDFs needs the free Poppler tools. In Terminal, run: brew install poppler" };
    console.error(`Reading ${path.basename(file)} failed`, error);
    return { text: "", pages: 0, problem: "This file could not be read. It is kept as it is." };
  }
}
