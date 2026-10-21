import { fail, fromThisApp, guarded, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { appendChunk, CHUNK_BYTES, isUploadId, MAX_FILE_BYTES, newUploadId, plainFileName, sweepAbandoned, uploadPath } from "@/lib/build/inbox";
import { tagNow } from "@/lib/build/service";
import { addInboxFile, getInboxFile, listInbox, presetTags } from "@/lib/build/store";
import { cleanCourse } from "@/lib/build/tags";

/**
 * Receives one piece of a file. Large files arrive in pieces, in order:
 *   ?name=…&offset=…&total=…[&id=…]   with the piece as the body.
 * The first piece gets an id back; the last piece puts the file in the inbox.
 * &course=FIN 101 says which course the file is for; &role=outline says it is a course outline.
 */
export function POST(request: Request) {
  return guarded("Uploading a file", async () => {
    if (!fromThisApp(request)) return fail("Uploads are only accepted from Study Coach itself.", 403);
    const params = new URL(request.url).searchParams;
    const name = plainFileName(params.get("name") ?? "");
    const offset = Number(params.get("offset"));
    const total = Number(params.get("total"));
    if (!name) return fail("That kind of file cannot be added. Use PDFs, slides, documents, notes or spreadsheets.");
    if (!Number.isInteger(offset) || !Number.isInteger(total) || offset < 0 || total <= 0 || total > MAX_FILE_BYTES) return fail("That file is empty or larger than 600 MB.");
    const given = params.get("id");
    if (given !== null && !isUploadId(given)) return fail("That upload could not be continued. Try the file again.");
    if (given === null && offset !== 0) return fail("That upload could not be continued. Try the file again.");
    const db = getDb();
    // A file that has fully arrived is never added to, whatever a late or repeated piece says.
    const finished = given === null ? null : getInboxFile(db, given);
    // The last piece sent again (its answer was lost on the way) is confirmed, not refused.
    if (finished) return finished.bytes === total && finished.name === name ? ok({ id: finished.id, received: total, done: true }) : fail("That file has already been added.");
    if (given === null) sweepAbandoned(new Set(listInbox(db).map((file) => file.id)));
    const id = given ?? newUploadId();

    // Refused before it is read into memory.
    if (Number(request.headers.get("content-length") ?? 0) > CHUNK_BYTES) return fail("A piece of that file is too large. Try the file again.");
    const chunk = Buffer.from(await request.arrayBuffer());
    if (chunk.length === 0 || chunk.length > CHUNK_BYTES || offset + chunk.length > total) return fail("A piece of that file did not arrive whole. Try the file again.");
    const written = appendChunk(id, name, offset, chunk);
    // A refused piece leaves what has arrived alone: the sender may retry from where it stopped.
    if (!written.ok) return fail(written.error);
    const done = written.size === total;
    if (done && addInboxFile(db, { id, name, path: uploadPath(id, name), origin: "upload", folder: "", bytes: total }, new Date())) {
      const course = cleanCourse(params.get("course") ?? "") ?? undefined;
      const isOutline = params.get("role") === "outline";
      if (course || isOutline) presetTags(db, id, { course, kind: isOutline ? "outline" : undefined });
      // An outline is read at once: the page then knows which course to ask files for.
      if (isOutline) await tagNow(id);
    }
    return ok({ id, received: written.size, done });
  });
}
