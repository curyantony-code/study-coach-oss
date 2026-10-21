import type { Db } from "./client";

export type QuizSource = "ai" | "ready";

export interface QuizResult {
  takenAt: string;
  /** The unit or topic the quiz was on; "" for the whole course. */
  topic: string;
  source: QuizSource;
  score: number;
  total: number;
}

export function saveQuizResult(db: Db, studentId: number, vaultId: string, result: QuizResult): void {
  db.prepare("INSERT INTO quiz_results (student_id, vault_id, taken_at, topic, source, score, total) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    studentId,
    vaultId,
    result.takenAt,
    result.topic,
    result.source,
    result.score,
    result.total
  );
}

/** Most recent first. */
export function listQuizResults(db: Db, studentId: number, vaultId: string, limit = 10): QuizResult[] {
  const rows = db
    .prepare("SELECT taken_at, topic, source, score, total FROM quiz_results WHERE student_id = ? AND vault_id = ? ORDER BY taken_at DESC, id DESC LIMIT ?")
    .all(studentId, vaultId, limit) as unknown as { taken_at: string; topic: string; source: QuizSource; score: number; total: number }[];
  return rows.map((r) => ({ takenAt: r.taken_at, topic: r.topic, source: r.source, score: r.score, total: r.total }));
}
