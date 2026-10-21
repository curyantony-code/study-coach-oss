// Writes study cards into the notes of a course the app built from files. One note per call,
// so progress shows and the run can be stopped. Only notes the builder itself wrote are
// touched, and only by adding (or replacing) their "Study cards" section at the end.
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { stage } from "../ai/pipeline";
import type { Db } from "../db/client";
import { getDb } from "../db/client";
import { getSetting, getVault, listVaults, setSetting, type Vault } from "../vault/registry";
import { forgetVaultIndex, getVaultIndex } from "../vault/store";
import { cardsSystemPrompt, cardsUserPrompt, checkCards, chunks, countCards, hasCards, hasOwnCardsSection, mergeCards, parseCards, renderCards, sourceText, withCards, type StudyCards } from "./cards";

const BUILT_KEY = (vaultId: string) => `built:${vaultId}`;
const STATUS_KEY = (vaultId: string) => `cards:${vaultId}`;
/** The line the builder puts at the top of every note it writes from a file. */
const BUILDER_MARK = /^\*Made by Study Coach from /m;
const MIN_SOURCE_CHARS = 200;

/** Remembers that a vault was created by the builder: only such vaults get cards written into them. */
export function markCourseBuilt(db: Db, vaultId: string): void {
  setSetting(db, BUILT_KEY(vaultId), new Date().toISOString());
}

export function builtVaults(db: Db): Vault[] {
  return listVaults(db).filter((vault) => getSetting(db, BUILT_KEY(vault.id)));
}

interface NoteStatus {
  /** done: cards written. none: tried, and nothing usable came back. */
  state: "done" | "none";
  cards: number;
  dropped: number;
}

function readStatus(db: Db, vaultId: string): Record<string, NoteStatus> {
  try {
    return JSON.parse(getSetting(db, STATUS_KEY(vaultId)) ?? "{}") as Record<string, NoteStatus>;
  } catch {
    return {};
  }
}

/** Notes in the vault that the builder wrote from a file, in the vault's own order. */
export function builderNotes(vault: Vault): string[] {
  const root = fs.realpathSync(vault.path);
  return getVaultIndex(vault).nodes.map((node) => node.id).filter((id) => {
    const file = path.join(root, ...id.split("/"));
    try {
      // A link could point outside the vault: such a note is never written to.
      if (fs.lstatSync(file).isSymbolicLink() || !fs.realpathSync(file).startsWith(root + path.sep)) return false;
      return BUILDER_MARK.test(fs.readFileSync(file, "utf8"));
    } catch {
      return false;
    }
  });
}

export interface CardsProgress {
  total: number;
  /** Notes dealt with: cards written, or tried with nothing usable. */
  done: number;
  /** Cards in the vault's notes so far. */
  cards: number;
  /** Notes where nothing usable came back. */
  empty: number;
}

export function cardsProgress(vault: Vault): CardsProgress {
  const status = readStatus(getDb(), vault.id);
  const notes = builderNotes(vault);
  const dealt = notes.filter((note) => status[note]);
  return {
    total: notes.length,
    done: dealt.length,
    cards: dealt.reduce((sum, note) => sum + status[note].cards, 0),
    empty: dealt.filter((note) => status[note].state === "none").length,
  };
}

export type CardsStep =
  | { ok: true; progress: CardsProgress; note: string | null; path: string | null; added: number; dropped: number; problem?: string }
  | { ok: false; error: string };

const BUSY = "The free AI models did not answer (they may be busy, or today's free allowance may be used up). Nothing was changed; try again later.";

const running = new Set<string>();

/**
 * Writes cards for the next note that has none. `again` also redoes notes that came back
 * empty; `skip` names the notes already tried in this run, so one that stays empty is not
 * tried over and over.
 */
export async function writeNextCards(vaultId: string, again = false, skip: string[] = []): Promise<CardsStep> {
  const db = getDb();
  const vault = getVault(db, vaultId);
  if (!vault || !getSetting(db, BUILT_KEY(vaultId))) return { ok: false, error: "Study cards are only written into courses that were built here from your files." };
  if (running.has(vaultId)) return { ok: false, error: "Cards are already being written for this course. Give it a moment." };
  running.add(vaultId);
  try {
    const status = readStatus(db, vaultId);
    const notes = builderNotes(vault);
    const tried = new Set(skip);
    const next = notes.find((note) => !tried.has(note) && (!status[note] || (again && status[note].state === "none")));
    if (!next) return { ok: true, progress: cardsProgress(vault), note: null, path: null, added: 0, dropped: 0 };
    const record = (state: NoteStatus["state"], cards: number, droppedCount: number) =>
      setSetting(db, STATUS_KEY(vaultId), JSON.stringify({ ...readStatus(db, vaultId), [next]: { state, cards, dropped: droppedCount } }));

    const file = path.join(fs.realpathSync(vault.path), ...next.split("/"));
    const index = getVaultIndex(vault);
    const title = index.nodes.find((node) => node.id === next)?.title ?? path.basename(next, ".md");
    let before: string;
    try {
      before = fs.readFileSync(file, "utf8");
    } catch (error) {
      // One unreadable note must not hold up the rest of the course.
      console.error(`Reading ${next} failed`, error);
      record("none", 0, 0);
      return { ok: true, progress: cardsProgress(vault), note: title, path: next, added: 0, dropped: 0, problem: "This note could not be read, so it was skipped." };
    }
    if (hasOwnCardsSection(before)) {
      record("none", 0, 0);
      return { ok: true, progress: cardsProgress(vault), note: title, path: next, added: 0, dropped: 0, problem: "This note already has a Study cards section of your own, so it was left alone." };
    }
    const source = sourceText(before);

    const parts: StudyCards[] = [];
    let dropped = 0;
    if (source.length >= MIN_SOURCE_CHARS) {
      for (const [at, chunk] of chunks(source).entries()) {
        const reply = await stage(cardsSystemPrompt(index.course.name), cardsUserPrompt(title, chunk));
        // No answer on the first piece: stop without marking the note, so it is tried again later.
        if (reply === null && at === 0) return { ok: false, error: BUSY };
        if (reply === null) break;
        const checked = checkCards(parseCards(reply), chunk);
        parts.push(checked.cards);
        dropped += checked.dropped;
      }
    }
    const cards = checkCards(mergeCards(parts), source).cards;
    const added = countCards(cards);
    if (added > 0) {
      // The note may have been edited while the AI was writing: only an unchanged note is written.
      if (fs.readFileSync(file, "utf8") !== before) return { ok: false, error: `${title} was changed while its cards were being written, so it was left alone. Run it again.` };
      const label = `${index.course.code ?? index.course.name} N${notes.indexOf(next) + 1}`;
      // A fresh name, created exclusively: a file or link already sitting there is never written through.
      const temp = path.join(path.dirname(file), `.${randomUUID()}.study-coach-tmp`);
      try {
        fs.writeFileSync(temp, withCards(before, renderCards(cards, label)), { flag: "wx" });
        fs.renameSync(temp, file);
      } catch (error) {
        console.error(`Writing cards into ${next} failed`, error);
        record("none", 0, dropped);
        return { ok: true, progress: cardsProgress(vault), note: title, path: next, added: 0, dropped, problem: "The cards could not be saved into this note, so it was left as it is." };
      } finally {
        fs.rmSync(temp, { force: true });
      }
      forgetVaultIndex(vaultId);
    }
    record(added > 0 ? "done" : "none", added, dropped);
    return { ok: true, progress: cardsProgress(vault), note: title, path: next, added, dropped };
  } finally {
    running.delete(vaultId);
  }
}

/** True when a note on disk already carries a cards section (written here or by hand). */
export function noteHasCards(file: string): boolean {
  try {
    return hasCards(fs.readFileSync(file, "utf8"));
  } catch {
    return false;
  }
}
