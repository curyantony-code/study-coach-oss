import fs from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { writeSnapshot } from "@/lib/backup/snapshot";
import { getDb } from "@/lib/db/client";
import { localToday } from "@/lib/vault/health";

/** Sends a complete copy of the app's database as one file to keep somewhere safe. */
export function GET() {
  return guarded("Making a backup", async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "study-coach-backup-"));
    try {
      const file = path.join(folder, "backup.db");
      writeSnapshot(getDb(), file);
      const body = fs.readFileSync(file);
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/vnd.sqlite3",
          "Content-Disposition": `attachment; filename="study-coach-backup-${localToday()}.db"`,
          "Content-Length": String(body.length),
          "Cache-Control": "no-store",
        },
      });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
}
