// What a picture inside a PDF holds, worked out from where its text sits. A text reader
// (the Mac's own, or Tesseract) gives boxes: a piece of text and its position. From those
// alone, code tells a spreadsheet from a paragraph from a diagram, and rebuilds the first two.
// No AI is involved, so the same picture always gives the same result.

/** One piece of text and where it sits, as fractions of the picture's width and height. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export type PictureKind = "table" | "text" | "figure";

/** Rows closer together than this many text-heights belong to one cell (a wrapped label). */
const SAME_CELL_SPACING = 1.6;
/** Right edges closer than this (of the picture's width) are the same column. */
const SAME_COLUMN = 0.03;
const MIN_TABLE_ROWS = 3;
const MIN_TABLE_COLUMNS = 2;
/** A picture is running text when its words cover at least this share of it. */
const TEXT_COVERAGE = 0.22;
const NUMERIC = /^[-–−(]?\s*[$€£]?\s*\d[\d.,]*\s*%?\)?$|^[-–−]$/;

export function isNumeric(text: string): boolean {
  return NUMERIC.test(text.trim());
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const centre = (box: Box) => box.y + box.h / 2;

/** Boxes grouped into visual lines, top to bottom, each line left to right. */
export function toLines(boxes: Box[]): Box[][] {
  const height = median(boxes.map((b) => b.h)) || 0.01;
  const lines: { at: number; boxes: Box[] }[] = [];
  for (const box of [...boxes].sort((a, b) => centre(a) - centre(b))) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(centre(box) - last.at) < height * 0.6) {
      last.boxes.push(box);
      last.at = last.boxes.reduce((sum, b) => sum + centre(b), 0) / last.boxes.length;
    } else {
      lines.push({ at: centre(box), boxes: [box] });
    }
  }
  return lines.map((line) => line.boxes.sort((a, b) => a.x - b.x));
}

/** Column positions: where the right edges of numbers line up. Numbers in tables are right-aligned. */
function columnEdges(lines: Box[][]): number[] {
  const edges = lines.flat().filter((b) => isNumeric(b.text)).map((b) => b.x + b.w).sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const edge of edges) {
    const last = clusters[clusters.length - 1];
    if (last && edge - last[last.length - 1] < SAME_COLUMN) last.push(edge);
    else clusters.push([edge]);
  }
  const numericLines = lines.filter((line) => line.some((b) => isNumeric(b.text))).length;
  const needed = Math.max(2, Math.ceil(numericLines * 0.25));
  return clusters.filter((c) => c.length >= needed).map((c) => c.reduce((sum, e) => sum + e, 0) / c.length);
}

/** "918.000" in a table of "1,248,480"s is a misread comma. */
function repairThousands(cells: string[][]): string[][] {
  const all = cells.flat();
  const commas = all.filter((c) => /\d,\d{3}\b/.test(c)).length;
  const dots = all.filter((c) => /^\D*\d{1,3}(\.\d{3})+\D*$/.test(c)).length;
  if (commas < 3 || dots === 0 || dots > commas) return cells;
  return cells.map((row) => row.map((cell) => (/^\D*\d{1,3}(\.\d{3})+\D*$/.test(cell) ? cell.replace(/\./g, ",") : cell)));
}

export interface Table {
  /** Column headings when the picture has a header row; otherwise empty strings. */
  header: string[];
  /** Each row: its label, then one cell per column. */
  rows: string[][];
}

/**
 * Rebuilds a table from boxes, or returns null when the boxes do not form one. Lines that
 * sit tightly together are one cell, so a label wrapped over three lines stays one row.
 */
export function toTable(boxes: Box[]): Table | null {
  const lines = toLines(boxes);
  const edges = columnEdges(lines);
  if (edges.length < MIN_TABLE_COLUMNS) return null;
  const height = median(boxes.map((b) => b.h)) || 0.01;
  const firstEdge = edges[0];
  const lineAt = (line: Box[]) => line.reduce((sum, b) => sum + centre(b), 0) / line.length;

  // Tight runs of lines: each run is one row of cells, unless it holds several lines of numbers.
  const runs: Box[][][] = [];
  for (const line of lines) {
    const run = runs[runs.length - 1];
    if (run && lineAt(line) - lineAt(run[run.length - 1]) <= height * SAME_CELL_SPACING) run.push(line);
    else runs.push([line]);
  }
  const groups: Box[][][] = runs.flatMap((run) => {
    const numbered = run.map((line, i) => (line.some((b) => isNumeric(b.text)) ? i : -1)).filter((i) => i >= 0);
    if (numbered.length <= 1) return [run];
    // A dense table: every line of numbers is its own row, and a label-only line joins the nearest one.
    const parts: Box[][][] = numbered.map((i) => [run[i]]);
    run.forEach((line, i) => {
      if (numbered.includes(i)) return;
      const nearest = numbered.reduce((best, n, at) => (Math.abs(n - i) < Math.abs(numbered[best] - i) ? at : best), 0);
      if (i < numbered[nearest]) parts[nearest].unshift(line);
      else parts[nearest].push(line);
    });
    return parts;
  });

  const rows: string[][] = [];
  for (const group of groups) {
    const all = group.flat();
    const numbers = all.filter((b) => isNumeric(b.text));
    const words = all.filter((b) => !isNumeric(b.text));
    // A line of words that reaches across the columns is a caption or a note, not a row.
    if (numbers.length === 0 && words.some((b) => b.x + b.w > firstEdge + SAME_COLUMN)) continue;
    const cells = [words.map((b) => b.text.trim()).join(" "), ...edges.map(() => "")];
    for (const box of numbers) {
      const column = edges.reduce((best, edge, i) => (Math.abs(edge - (box.x + box.w)) < Math.abs(edges[best] - (box.x + box.w)) ? i : best), 0);
      cells[column + 1] = [cells[column + 1], box.text.trim()].filter(Boolean).join(" ");
    }
    if (cells.some((c) => c !== "")) rows.push(cells);
  }
  const dataRows = rows.filter((row) => row.slice(1).filter(Boolean).length >= 2);
  if (dataRows.length < MIN_TABLE_ROWS) return null;

  const repaired = repairThousands(rows);
  // A first row of small whole numbers with no label is the header (years 0 to 8, say).
  const [first, ...rest] = repaired;
  const isHeader = first[0] === "" && first.slice(1).filter(Boolean).length >= 2 && first.slice(1).every((c) => c === "" || /^\d{1,4}$/.test(c));
  return isHeader ? { header: first, rows: rest } : { header: first.map(() => ""), rows: repaired };
}

/** What a picture is: a table when one can be rebuilt, running text when words fill it, otherwise a figure. */
export function classify(boxes: Box[]): PictureKind {
  if (boxes.length === 0) return "figure";
  if (toTable(boxes)) return "table";
  const covered = boxes.reduce((sum, b) => sum + b.w * b.h, 0);
  const words = boxes.reduce((sum, b) => sum + b.text.trim().split(/\s+/).length, 0);
  // Sentences run wide; a diagram's labels are short and scattered.
  const wide = boxes.filter((b) => b.w > 0.5).length;
  return covered >= TEXT_COVERAGE || (words >= 30 && wide >= 3) ? "text" : "figure";
}

const MIN_COLUMN_BOXES = 8;

/**
 * Splits a two-column page at its gutter: a vertical band near the middle that no text
 * crosses, with plenty of text on both sides. Otherwise returns the boxes as one column.
 */
export function splitColumns(boxes: Box[]): Box[][] {
  for (let step = 0; step <= 15; step++) {
    // Try the middle first, then widen outwards.
    for (const gutter of step === 0 ? [0.5] : [0.5 - step * 0.01, 0.5 + step * 0.01]) {
      if (boxes.some((b) => b.x < gutter && b.x + b.w > gutter)) continue;
      const left = boxes.filter((b) => b.x + b.w <= gutter);
      const right = boxes.filter((b) => b.x >= gutter);
      if (left.length >= MIN_COLUMN_BOXES && right.length >= MIN_COLUMN_BOXES) return [left, right];
    }
  }
  return [boxes];
}

/** Running text: columns read one after the other, lines joined into paragraphs. */
export function toParagraphs(boxes: Box[]): string[] {
  const columns = splitColumns(boxes);
  return columns.length > 1 ? columns.flatMap(columnParagraphs) : columnParagraphs(boxes);
}

function columnParagraphs(boxes: Box[]): string[] {
  const lines = toLines(boxes);
  const height = median(boxes.map((b) => b.h)) || 0.01;
  const paragraphs: string[][] = [];
  let previous: Box[] | null = null;
  for (const line of lines) {
    const text = line.map((b) => b.text.trim()).join(" ");
    const gap = previous ? line[0].y - (previous[0].y + previous[0].h) : Infinity;
    // A new paragraph after a wide gap, or when the line starts a bullet the reader kept.
    if (gap > height * 0.9 || /^[•·▪■●○◦‣-]\s/.test(text) || paragraphs.length === 0) paragraphs.push([text]);
    else paragraphs[paragraphs.length - 1].push(text);
    previous = line;
  }
  // A word split over two lines ("full-" / "scale") is put back together.
  return paragraphs.map((p) => p.join(" ").replace(/(\w)- (?=[a-z])/g, "$1-").replace(/^[•·▪■●○◦‣]\s*/, "- "));
}

/** The words on a figure, in reading order, for its caption and for search. */
export function figureLabels(boxes: Box[]): string {
  return toLines(boxes).map((line) => line.map((b) => b.text.trim()).join(" ")).filter(Boolean).join(" · ");
}
