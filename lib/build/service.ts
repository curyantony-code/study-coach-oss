// Runs the two slow steps of building a course: tagging the files in the inbox a few at a
// time, and creating a course's vault from the files the student has checked.
import fs from "fs";
import path from "path";
import { getDb } from "../db/client";
import { addVault, listVaults, type Vault } from "../vault/registry";
import { extractText, READABLE, sampleText } from "./extract";
import { askSmallModel } from "./model";
import { courseNameIn, planCourse, type BuildFile, type CoursePlan } from "./plan";
import { markCourseBuilt } from "./cards-service";
import { removeUpload } from "./inbox";
import { getInboxFile, listInbox, markBuilt, saveTags, type InboxFile } from "./store";
import { tagFile, type Tags } from "./tags";
import { buildRoot, InsideVaultError, writeVault } from "./write";

const ROUND_BUDGET_MS = 25_000;
const SAMPLE_PAGES = 6;
const MIN_BOOK_PAGES = 20;
const NOTE_KINDS = new Set(["slides", "notes"]);

export interface TagProgress {
  total: number;
  done: number;
}

/** Course codes the student already works with: their vaults, and files tagged so far. */
export function knownCourses(vaults: Pick<Vault, "name">[], files: Pick<InboxFile, "course">[]): string[] {
  const codes = vaults.flatMap((vault) => {
    const match = vault.name.match(/\b([A-Za-z]{3,4})[ _-]?(\d{3}[A-Za-z]?)\b/);
    return match ? [`${match[1].toUpperCase()} ${match[2].toUpperCase()}`] : [];
  });
  return [...new Set([...codes, ...files.flatMap((file) => (file.course ? [file.course] : []))])].sort();
}

/** How far up from a file's folder its neighbours are looked for. */
const NEIGHBOUR_LEVELS = 4;
/** The share of the coded files around it that must agree before a file follows them. */
const CLEAR_MAJORITY = 0.6;

/**
 * Files with no course code of their own take the course of the files around them: the
 * nearest folder above them whose files mostly agree, then the whole inbox when it holds a
 * single course.
 */
export function coursesFromNeighbours(files: (Pick<InboxFile, "id" | "course" | "path" | "origin" | "status"> & Partial<Pick<InboxFile, "how">>)[]): Map<string, string> {
  const tagged = files.filter((file) => file.status !== "new");
  const coded = tagged.filter((file) => file.course);
  const overall = new Set(coded.map((file) => file.course!));
  const only = overall.size === 1 ? [...overall][0] : null;
  const majorityUnder = (folder: string): string | null | undefined => {
    const counts = new Map<string, number>();
    for (const file of coded) {
      if (file.origin === "folder" && file.path.startsWith(folder + path.sep)) counts.set(file.course!, (counts.get(file.course!) ?? 0) + 1);
    }
    if (counts.size === 0) return undefined;
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const [course, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
    return count / total >= CLEAR_MAJORITY ? course : null;
  };
  const filled = new Map<string, string>();
  for (const file of tagged) {
    // A file the student left without a course on purpose stays that way.
    if (file.course || file.how === "you") continue;
    let course: string | null = null;
    if (file.origin === "folder") {
      let folder = path.dirname(file.path);
      for (let level = 0; level < NEIGHBOUR_LEVELS; level++, folder = path.dirname(folder)) {
        const found = majorityUnder(folder);
        // The nearest folder with coded files decides, even when they disagree.
        if (found !== undefined) {
          course = found;
          break;
        }
      }
    }
    if (course ?? only) filled.set(file.id, (course ?? only)!);
  }
  return filled;
}

/**
 * Whether the small model can add anything. It is the slow step, so it is asked only for what
 * it can supply: the kind when the rules are unsure, and a topic for a deck or a note whose
 * name gave none. A missing course is not a reason: a course the model names must be written
 * in the file, and the rules have already looked there.
 */
function needsModel(tags: Tags, hasText: boolean): boolean {
  if (!hasText) return false;
  const weakTitle = tags.title.split(" ").length < 2;
  return !tags.kindSure || (weakTitle && NOTE_KINDS.has(tags.kind));
}

async function tagOne(file: InboxFile, known: string[]): Promise<void> {
  const db = getDb();
  if (!fs.existsSync(file.path)) {
    saveTags(db, file.id, { course: null, kind: "other", unit: null, title: file.name, how: "rules", pages: 0, problem: "This file is no longer where it was." });
    return;
  }
  const readable = READABLE.has(path.extname(file.name).toLowerCase());
  const extracted = readable ? await sampleText(file.path, SAMPLE_PAGES) : { text: "", pages: 0, problem: "Kept as a file; its text is not read." };
  const { text, pages } = extracted;
  // Titles used by the course's other units: a line on every deck is the course's name, not this deck's topic.
  const others = listInbox(db).filter((other) => other.id !== file.id && other.status !== "new");
  const taken = (course: string | null, unit: InboxFile["unit"]) => others.filter((other) => other.course === course && other.unit?.key !== unit?.key).map((other) => other.title);
  const rules = tagFile({ name: file.name, text, pages, folder: file.folder }, known, taken);
  // What the student said when adding the file stands: the rules and the model only fill in the rest.
  const course = file.fixed.course ? file.course : rules.course;
  if (file.fixed.kind) {
    const title = (file.kind === "outline" && course ? courseNameIn(text, course) : null) ?? rules.title;
    if (getInboxFile(db, file.id)?.status === "new") saveTags(db, file.id, { course, kind: file.kind, unit: null, title, how: "rules", pages, problem: extracted.problem ?? null });
    return;
  }
  const asked = needsModel(rules, text.trim().length > 0) ? await askSmallModel(file.name, text, pages, known) : null;
  // A few pages are not a book, whatever the model says.
  const model = asked && asked.kind === "textbook" && pages < MIN_BOOK_PAGES ? { ...asked, kind: null } : asked;
  const weakTitle = rules.title.split(" ").length < 2;
  const merged = {
    course: course ?? model?.course ?? null,
    kind: rules.kindSure ? rules.kind : model?.kind ?? rules.kind,
    unit: rules.unit ?? model?.unit ?? null,
    title: weakTitle && model?.title ? model.title : rules.title,
  };
  const usedModel = model !== null && (merged.course !== course || merged.kind !== rules.kind || merged.unit !== rules.unit || merged.title !== rules.title);
  // The student may have corrected or removed this file while it was being read.
  const now = getInboxFile(db, file.id);
  if (!now || now.status !== "new") return;
  saveTags(db, file.id, { ...merged, how: usedModel ? "model" : "rules", pages, problem: extracted.problem ?? null });
}

/** Tags one file straight away: an outline is read as soon as it arrives, so its course can be shown. */
export async function tagNow(id: string): Promise<void> {
  const db = getDb();
  const file = getInboxFile(db, id);
  if (file?.status === "new") await tagOne(file, knownCourses(listVaults(db), listInbox(db)));
}

let tagging: Promise<TagProgress> | null = null;

/** Tags the next few untagged files and says how far along the inbox is. Two calls at once share one round. */
export function tagRound(): Promise<TagProgress> {
  tagging ??= runTagRound().finally(() => { tagging = null; });
  return tagging;
}

async function runTagRound(): Promise<TagProgress> {
  const db = getDb();
  const started = Date.now();
  let files = listInbox(db);
  for (const file of files.filter((f) => f.status === "new")) {
    await tagOne(file, knownCourses(listVaults(db), files));
    files = listInbox(db);
    if (Date.now() - started > ROUND_BUDGET_MS) break;
  }
  if (files.every((file) => file.status !== "new")) {
    for (const [id, course] of coursesFromNeighbours(files)) {
      const file = files.find((f) => f.id === id)!;
      saveTags(db, id, { course, kind: file.kind, unit: file.unit, title: file.title, how: file.how || "rules" });
    }
  }
  return { total: files.length, done: files.filter((file) => file.status !== "new").length };
}

export interface BuiltCourse {
  course: string;
  vaultId: string;
  folder: string;
  notes: number;
  files: number;
  units: number;
}

async function toBuildFile(file: InboxFile): Promise<BuildFile> {
  const wanted = NOTE_KINDS.has(file.kind) || file.kind === "outline";
  const pages = wanted && READABLE.has(path.extname(file.name).toLowerCase()) ? (await extractText(file.path)).pages : [];
  return { id: file.id, name: file.name, kind: file.kind, unit: file.unit, title: file.title || file.name, pages };
}

/** The files of one course that are checked and not yet in a vault. */
export function courseFiles(files: InboxFile[], course: string): InboxFile[] {
  return files.filter((file) => file.status === "tagged" && file.course === course);
}

export async function previewCourse(course: string, files: InboxFile[]): Promise<CoursePlan> {
  const buildFiles: BuildFile[] = [];
  for (const file of files) buildFiles.push(await toBuildFile(file));
  const outline = buildFiles.find((file) => file.kind === "outline");
  return planCourse(course, buildFiles, outline?.pages.join("\n") ?? "");
}

const building = new Set<string>();

/** Creates the vault for one course and adds it to the app. Originals are copied, never moved. */
export async function buildCourse(course: string): Promise<BuiltCourse | { error: string }> {
  // A second press (another tab, a reload) while the first is still working must not make a second vault.
  if (building.has(course)) return { error: "That course is already being built. Give it a moment." };
  building.add(course);
  try {
    return await runBuild(course);
  } catch (error) {
    if (error instanceof InsideVaultError) return { error: error.message };
    throw error;
  } finally {
    building.delete(course);
  }
}

async function runBuild(course: string): Promise<BuiltCourse | { error: string }> {
  const db = getDb();
  const files = courseFiles(listInbox(db), course).filter((file) => fs.existsSync(file.path));
  if (files.length === 0) return { error: "There are no checked files for that course." };
  const plan = await previewCourse(course, files);
  const folder = writeVault(buildRoot(db), plan, new Map(files.map((file) => [file.id, file.path])), listVaults(db).map((vault) => vault.path));
  const vault = addVault(db, folder, plan.courseName === course ? course : `${course} - ${plan.courseName}`);
  markBuilt(db, files.map((file) => file.id), vault.id);
  markCourseBuilt(db, vault.id);
  // Uploads were waiting in the app's own folder; they now live in the vault's raw/ folder.
  for (const file of files) if (file.origin === "upload") removeUpload(file.id);
  return { course, vaultId: vault.id, folder, notes: plan.notes.length - 1, files: plan.copies.length, units: plan.units.length };
}
