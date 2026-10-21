import type { Attempt, CardState, Confidence, StoredFsrs, StudyMode } from "../learner/types";
import type { Db } from "./client";

export interface Student {
  id: number;
  name: string;
}

/** The app is single-user until Phase 4, so there is one local student. */
export function getOrCreateStudent(db: Db): Student {
  const existing = db.prepare("SELECT id, name FROM students ORDER BY id LIMIT 1").get() as unknown as Student | undefined;
  if (existing) return existing;
  const result = db.prepare("INSERT INTO students (name, created_at) VALUES (?, ?)").run("Me", new Date().toISOString());
  return { id: Number(result.lastInsertRowid), name: "Me" };
}

export function renameStudent(db: Db, studentId: number, name: string): void {
  db.prepare("UPDATE students SET name = ? WHERE id = ?").run(name, studentId);
}

interface CardStateRow {
  card_id: string;
  node_path: string;
  fsrs: string | null;
  seen: number;
  correct: number;
  confident_wrong: number;
  needs_fix: number;
  guessed_first: number;
  last_seen: string | null;
}

function toCardState(row: CardStateRow): CardState {
  return {
    cardId: row.card_id,
    nodePath: row.node_path,
    fsrs: row.fsrs ? (JSON.parse(row.fsrs) as StoredFsrs) : null,
    seen: row.seen,
    correct: row.correct,
    confidentWrong: row.confident_wrong,
    needsFix: row.needs_fix === 1,
    guessedFirst: row.guessed_first === 1,
    lastSeen: row.last_seen,
  };
}

export function getCardStates(db: Db, studentId: number, vaultId: string): Map<string, CardState> {
  const rows = db
    .prepare("SELECT * FROM card_state WHERE student_id = ? AND vault_id = ?")
    .all(studentId, vaultId) as unknown as CardStateRow[];
  return new Map(rows.map((row) => [row.card_id, toCardState(row)]));
}

export function getCardState(db: Db, studentId: number, vaultId: string, cardId: string): CardState | null {
  const row = db
    .prepare("SELECT * FROM card_state WHERE student_id = ? AND vault_id = ? AND card_id = ?")
    .get(studentId, vaultId, cardId) as unknown as CardStateRow | undefined;
  return row ? toCardState(row) : null;
}

export function saveCardState(db: Db, studentId: number, vaultId: string, state: CardState): void {
  db.prepare(
    `INSERT INTO card_state (student_id, vault_id, card_id, node_path, fsrs, seen, correct, confident_wrong, needs_fix, guessed_first, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (student_id, vault_id, card_id) DO UPDATE SET
       node_path = excluded.node_path, fsrs = excluded.fsrs, seen = excluded.seen, correct = excluded.correct,
       confident_wrong = excluded.confident_wrong, needs_fix = excluded.needs_fix,
       guessed_first = excluded.guessed_first, last_seen = excluded.last_seen`
  ).run(
    studentId, vaultId, state.cardId, state.nodePath, state.fsrs ? JSON.stringify(state.fsrs) : null,
    state.seen, state.correct, state.confidentWrong, state.needsFix ? 1 : 0, state.guessedFirst ? 1 : 0, state.lastSeen
  );
}

export interface NewAttempt extends Attempt {
  hintUsed?: boolean;
  distracted?: boolean;
}

export function insertAttempt(db: Db, studentId: number, vaultId: string, attempt: NewAttempt): void {
  db.prepare(
    `INSERT INTO attempts (student_id, vault_id, card_id, node_path, scope, mode, correct, confidence, response_ms, hint_used, distracted, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    studentId, vaultId, attempt.cardId, attempt.nodePath, attempt.scope, attempt.mode, attempt.correct ? 1 : 0,
    attempt.confidence, attempt.responseMs, attempt.hintUsed ? 1 : 0, attempt.distracted ? 1 : 0, attempt.createdAt
  );
}

interface AttemptRow {
  card_id: string;
  node_path: string;
  scope: string;
  mode: string;
  correct: number;
  confidence: string | null;
  response_ms: number | null;
  created_at: string;
}

export function listAttempts(db: Db, studentId: number, vaultId: string): Attempt[] {
  const rows = db
    .prepare("SELECT * FROM attempts WHERE student_id = ? AND vault_id = ? ORDER BY created_at, id")
    .all(studentId, vaultId) as unknown as AttemptRow[];
  return rows.map((row) => ({
    cardId: row.card_id,
    nodePath: row.node_path,
    scope: row.scope,
    mode: row.mode as StudyMode,
    correct: row.correct === 1,
    confidence: row.confidence as Confidence | null,
    responseMs: row.response_ms,
    createdAt: row.created_at,
  }));
}

/** Every attempt time for a student across all vaults: the streak is about the habit, not one course. */
export function listAttemptTimes(db: Db, studentId: number): string[] {
  const rows = db.prepare("SELECT created_at FROM attempts WHERE student_id = ?").all(studentId) as unknown as { created_at: string }[];
  return rows.map((r) => r.created_at);
}

export type SleepQuality = "good" | "ok" | "poor";

/** One-tap sleep check-in, at most one per day (the latest answer wins). */
export function saveCheckin(db: Db, studentId: number, day: string, sleep: SleepQuality): void {
  db.prepare("INSERT INTO checkins (student_id, day, sleep) VALUES (?, ?, ?) ON CONFLICT (student_id, day) DO UPDATE SET sleep = excluded.sleep").run(studentId, day, sleep);
}

export function getCheckin(db: Db, studentId: number, day: string): SleepQuality | null {
  const row = db.prepare("SELECT sleep FROM checkins WHERE student_id = ? AND day = ?").get(studentId, day) as { sleep: SleepQuality } | undefined;
  return row?.sleep ?? null;
}

/** Runs several writes as one unit: either all are saved or none. */
export function inTransaction<T>(db: Db, work: () => T): T {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getProfileAnswers(db: Db, studentId: number, vaultId: string): unknown | null {
  const row = db
    .prepare("SELECT answers FROM profiles WHERE student_id = ? AND vault_id = ?")
    .get(studentId, vaultId) as { answers: string } | undefined;
  return row ? JSON.parse(row.answers) : null;
}

export function saveProfileAnswers(db: Db, studentId: number, vaultId: string, answers: unknown): void {
  db.prepare(
    `INSERT INTO profiles (student_id, vault_id, answers, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (student_id, vault_id) DO UPDATE SET answers = excluded.answers, updated_at = excluded.updated_at`
  ).run(studentId, vaultId, JSON.stringify(answers), new Date().toISOString());
}

export interface Explanation {
  nodePath: string;
  text: string;
  /** 0–100. From the AI, or from the student's own rating when `selfRated`. */
  score: number | null;
  covered: string[];
  missing: string[];
  tip: string;
  selfRated: boolean;
  createdAt: string;
}

/** A teach-back attempt: what the student wrote and how it was judged. */
export function saveExplanation(db: Db, studentId: number, vaultId: string, explanation: Explanation): void {
  db.prepare(
    `INSERT INTO explanations (student_id, vault_id, node_path, text, ai_score, covered, missing, tip, self_rated, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    studentId, vaultId, explanation.nodePath, explanation.text, explanation.score, JSON.stringify(explanation.covered),
    JSON.stringify(explanation.missing), explanation.tip, explanation.selfRated ? 1 : 0, explanation.createdAt
  );
}

interface ExplanationRow {
  node_path: string;
  text: string;
  ai_score: number | null;
  covered: string;
  missing: string;
  tip: string;
  self_rated: number;
  created_at: string;
}

/** The most recent teach-back per note, newest first. */
export function latestExplanations(db: Db, studentId: number, vaultId: string): Explanation[] {
  const rows = db
    .prepare(
      `SELECT e.* FROM explanations e
       JOIN (SELECT node_path, MAX(id) AS id FROM explanations WHERE student_id = ? AND vault_id = ? GROUP BY node_path) latest ON latest.id = e.id
       ORDER BY e.id DESC`
    )
    .all(studentId, vaultId) as unknown as ExplanationRow[];
  return rows.map((row) => ({
    nodePath: row.node_path,
    text: row.text,
    score: row.ai_score,
    covered: JSON.parse(row.covered) as string[],
    missing: JSON.parse(row.missing) as string[],
    tip: row.tip,
    selfRated: row.self_rated === 1,
    createdAt: row.created_at,
  }));
}

export interface StoredPaper<Q> {
  id: string;
  scope: string;
  questions: Q[];
  /** Set once the result has been saved to progress; a paper is only ever recorded once. */
  recordedAt: string | null;
}

/** Keeps the mock exam the server issued, so marking never depends on what the browser sends back. */
export function savePaper<Q>(db: Db, studentId: number, vaultId: string, paper: { id: string; scope: string; questions: Q[] }, now: Date): void {
  db.prepare("INSERT INTO exam_papers (id, student_id, vault_id, scope, questions, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    paper.id, studentId, vaultId, paper.scope, JSON.stringify(paper.questions), now.toISOString()
  );
}

export function getPaper<Q>(db: Db, studentId: number, vaultId: string, id: string): StoredPaper<Q> | null {
  const row = db
    .prepare("SELECT id, scope, questions, recorded_at FROM exam_papers WHERE id = ? AND student_id = ? AND vault_id = ?")
    .get(id, studentId, vaultId) as { id: string; scope: string; questions: string; recorded_at: string | null } | undefined;
  return row ? { id: row.id, scope: row.scope, questions: JSON.parse(row.questions) as Q[], recordedAt: row.recorded_at } : null;
}

/** Returns false when the paper had already been recorded (so the caller must not record it again). */
export function claimPaperRecording(db: Db, id: string, now: Date): boolean {
  const result = db.prepare("UPDATE exam_papers SET recorded_at = ? WHERE id = ? AND recorded_at IS NULL").run(now.toISOString(), id);
  return Number(result.changes) === 1;
}
