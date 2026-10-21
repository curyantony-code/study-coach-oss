import fs from "fs";
import os from "os";
import path from "path";
import { fail, guarded, ok } from "@/lib/api";
import { checkBackup, restoreInto, summarise, writeSnapshot } from "@/lib/backup/snapshot";
import { getDb } from "@/lib/db/client";
import { forgetAllVaultIndexes } from "@/lib/vault/store";

const MAX_BYTES = 300 * 1024 * 1024;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** A restore replaces everything, so it is only accepted from the app's own pages, never from another website's form. */
function fromThisApp(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * mode=check   says what is in an uploaded backup, and what is in the app now. Changes nothing.
 * mode=restore replaces the app's data with the backup's, after saving a copy of the current
 *              data to data/backups so the restore itself can be undone.
 */
export function POST(request: Request) {
  return guarded("Restoring a backup", async () => {
    if (!fromThisApp(request)) return fail("Restoring is only possible from Study Coach itself.", 403);
    const form = await request.formData().catch(() => null);
    const upload = form?.get("file");
    const mode = form?.get("mode");
    if (!(upload instanceof File) || (mode !== "check" && mode !== "restore")) return fail("Choose a backup file first.");
    if (upload.size === 0 || upload.size > MAX_BYTES) return fail("That file is empty or too large to be a Study Coach backup.");

    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "study-coach-restore-"));
    try {
      const file = path.join(folder, "upload.db");
      fs.writeFileSync(file, Buffer.from(await upload.arrayBuffer()));
      const check = checkBackup(file);
      if (!check.ok) return fail(check.error);
      const db = getDb();
      if (mode === "check") return ok({ backup: check.summary, current: summarise(db) });

      const dbFile = process.env.STUDY_DB_PATH || path.join(process.cwd(), "data", "study.db");
      const safety = path.join(path.dirname(dbFile), "backups", `before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
      writeSnapshot(db, safety);
      const restored = restoreInto(db, file);
      forgetAllVaultIndexes();
      return ok({ restored, safetyCopy: path.basename(safety) });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
}
