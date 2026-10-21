import Link from "next/link";
import { clearBuiltAction, retagAction } from "@/app/build/actions";
import { removeFileAction } from "@/app/build/actions";
import AssignAllForm from "@/components/build/AssignAllForm";
import BuildRunner from "@/components/build/BuildRunner";
import CardsRunner from "@/components/build/CardsRunner";
import FileRow from "@/components/build/FileRow";
import FolderForm from "@/components/build/FolderForm";
import OutlineCourseForm from "@/components/build/OutlineCourseForm";
import RootForm from "@/components/build/RootForm";
import TagRunner from "@/components/build/TagRunner";
import Uploader from "@/components/build/Uploader";
import { SECONDARY } from "@/components/build/styles";
import { smallLocalModel } from "@/lib/ai/local-models";
import { canStage } from "@/lib/ai/pipeline";
import { builtVaults as coursesBuiltHere, cardsProgress } from "@/lib/build/cards-service";
import { listInbox, type InboxFile } from "@/lib/build/store";
import { KIND_LABELS, KINDS, type Kind } from "@/lib/build/tags";
import { buildRoot } from "@/lib/build/write";
import { getDb } from "@/lib/db/client";
import { getVault } from "@/lib/vault/registry";

export const dynamic = "force-dynamic";

const CARD = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
const NOTE_KINDS = new Set<Kind>(["slides", "notes"]);

function byKindThenUnit(a: InboxFile, b: InboxFile): number {
  return KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || (a.unit?.key ?? "~").localeCompare(b.unit?.key ?? "~", undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true });
}

function kindCounts(files: InboxFile[]): string {
  return KINDS.map((kind) => ({ kind, count: files.filter((file) => file.kind === kind).length }))
    .filter(({ count }) => count > 0)
    .map(({ kind, count }) => `${count} ${KIND_LABELS[kind].toLowerCase()}`)
    .join(", ");
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  const id = `build-step-${number}`;
  return (
    <section aria-labelledby={id} className={CARD}>
      <h2 id={id} className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900">
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-sm text-white">{number}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function BuildPage() {
  const db = getDb();
  const files = listInbox(db);
  const waiting = files.filter((file) => file.status !== "built");
  const tagged = waiting.filter((file) => file.status === "tagged");
  const built = files.filter((file) => file.status === "built");
  const courses = [...new Set(tagged.flatMap((file) => (file.course ? [file.course] : [])))].sort();
  const unsorted = tagged.filter((file) => !file.course).sort(byKindThenUnit);
  const root = buildRoot(db);
  const model = await smallLocalModel();
  // A course starts with its outline: each outline added in step 1 opens a place for that course's files.
  const outlines = waiting.filter((file) => file.kind === "outline" && file.fixed.kind);
  const started = [...new Set(outlines.flatMap((file) => (file.course ? [file.course] : [])))].sort();
  const nameOf = (course: string) => outlines.find((file) => file.course === course && file.title && file.title !== course)?.title ?? null;
  const cardCourses = coursesBuiltHere(db).map((vault) => ({ vault, progress: cardsProgress(vault) }));
  const builtVaults = [...new Set(built.flatMap((file) => (file.vaultId ? [file.vaultId] : [])))].flatMap((id) => getVault(db, id) ?? []);

  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-6">
      <header>
        <h1 className="mb-1 text-3xl font-extrabold gradient-text">New course from files</h1>
        <p className="text-sm text-slate-500">
          Start each course with its outline, add that course&apos;s files, let Study Coach tag each one with its kind and chapter, check the tags, and it builds a vault for every course.
          Your original files are copied, never moved or changed, and existing vaults are never written into.
        </p>
      </header>

      <Step number={1} title="Add each course's outline">
        <div className="space-y-4">
          <Uploader role="outline" prompt="Drop the course outline (syllabus) of each course here." hint="One outline per course. It names the course and gives its test dates." button="Choose outline" />
          {outlines.length > 0 && (
            <ul className="space-y-2">
              {outlines.map((outline) => (
                <li key={outline.id} className={`rounded-2xl border p-3 ${outline.course ? "border-slate-200 bg-white" : "border-amber-300 bg-amber-50"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{outline.course ?? "Course not found"}{outline.course && nameOf(outline.course) ? ` · ${nameOf(outline.course)}` : ""}</p>
                      <p className="break-words text-xs text-slate-500">{outline.name}</p>
                      {outline.problem && <p className="mt-1 text-xs text-amber-800">{outline.problem}</p>}
                    </div>
                    <form action={removeFileAction}>
                      <input type="hidden" name="id" value={outline.id} />
                      <button type="submit" aria-label={`Remove the outline ${outline.name}`} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 active:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">Remove</button>
                    </form>
                  </div>
                  {!outline.course && <OutlineCourseForm id={outline.id} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Step>

      <Step number={2} title="Add each course's files">
        <div className="space-y-4">
          {started.length === 0 && <p className="text-sm text-slate-500">Each outline you add above opens a place here for that course&apos;s slides, notes, textbook and problem sets.</p>}
          {started.map((course) => {
            const count = waiting.filter((file) => file.course === course).length - outlines.filter((file) => file.course === course).length;
            return (
              <section key={course} aria-label={`Files for ${course}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-base font-bold text-slate-900">{course}{nameOf(course) ? <span className="font-medium text-slate-600"> · {nameOf(course)}</span> : null}</h3>
                <p className="mb-3 text-xs text-slate-500">{count === 0 ? "No files yet." : `${count} file${count === 1 ? "" : "s"} added.`} Everything dropped here goes to {course}.</p>
                <Uploader course={course} prompt={`Drop the files for ${course} here: slides, notes, textbook, problem sets, past exams.`} button={`Choose ${course} files`} />
              </section>
            );
          })}
          <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Other ways to add files</summary>
            <div className="mt-4 space-y-5">
              <Uploader prompt="Drop a mixed pile of files here and let Study Coach work out each one's course." hint="Slower and less sure than adding them course by course: files with no course code in their name will need you to say where they go." />
              <FolderForm />
            </div>
          </details>
        </div>
      </Step>

      <Step number={3} title="Tag them">
        {waiting.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing is waiting. Add files above first.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Rules in code read each file&apos;s name, folder and first pages. {model
                ? <>Anything they cannot decide is put to the small model on this computer ({model}), and its answer is checked before it is used. Nothing is sent off this computer.</>
                : <>No small model is installed on this computer, so the start of any file the rules cannot decide is sent to a free cloud model, or the file is left for you.</>}
            </p>
            <TagRunner total={waiting.length} done={tagged.length} />
            {tagged.length === waiting.length && (
              <form action={retagAction} className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-emerald-700">All {waiting.length} files are tagged.</p>
                <button type="submit" className={SECONDARY}>Tag them again</button>
              </form>
            )}
          </div>
        )}
      </Step>

      <Step number={4} title="Check the tags, then build">
        {builtVaults.length > 0 && (
          <div role="status" className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="text-sm font-bold text-emerald-900">Built</h3>
            <ul className="mt-1 space-y-2 text-sm text-emerald-900">
              {builtVaults.map((vault) => (
                <li key={vault.id}>
                  <span className="font-semibold">{vault.name}</span> · {built.filter((file) => file.vaultId === vault.id).length} files ·{" "}
                  <Link href={`/vaults/review?vault=${vault.id}`} className="font-semibold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Check how it is split into units</Link>
                  <span className="block break-all font-mono text-xs opacity-80">{vault.path}</span>
                </li>
              ))}
            </ul>
            <form action={clearBuiltAction} className="mt-3 flex flex-wrap items-center gap-3">
              <button type="submit" className={SECONDARY}>Clear this list</button>
              <span className="text-xs">Clearing the list removes nothing from your courses.</span>
            </form>
          </div>
        )}
        {tagged.length === 0 ? (
          <p className="text-sm text-slate-500">{builtVaults.length > 0 ? "Nothing else is waiting." : "Tagged files appear here, grouped by course."}</p>
        ) : (
          <div className="space-y-5">
            <RootForm root={root} />
            <p className="text-xs text-slate-500">
              Each course gets a folder of its own there, with your originals under <span className="font-mono">raw/</span>, a note for every set of slides or notes
              under <span className="font-mono">wiki/</span>, and a <span className="font-mono">study.yml</span>. Test dates are read from the course outline.
            </p>

            {unsorted.length > 0 && (
              <details open className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <summary className="cursor-pointer text-sm font-bold text-amber-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  No course found for {unsorted.length} file{unsorted.length === 1 ? "" : "s"}
                </summary>
                <p className="mt-1 text-xs text-amber-900">Type the course code for each one, or leave it out. Files without a course are not built into anything.</p>
                <AssignAllForm count={unsorted.length} />
                <ul className="mt-3 space-y-2">{unsorted.map((file) => <FileRow key={`${file.id}-${file.how}-${file.kind}-${file.course}`} file={file} />)}</ul>
              </details>
            )}

            {courses.map((course) => {
              const mine = tagged.filter((file) => file.course === course).sort(byKindThenUnit);
              const notes = mine.filter((file) => NOTE_KINDS.has(file.kind) && !file.problem).length;
              const hasOutline = mine.some((file) => file.kind === "outline");
              return (
                <details key={course} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <span className="text-base font-bold text-slate-900">{course}</span>
                    <span className="ml-2 text-sm text-slate-600">{mine.length} file{mine.length === 1 ? "" : "s"}: {kindCounts(mine)}</span>
                  </summary>
                  <p className="mt-2 text-sm text-slate-600">
                    {notes} note{notes === 1 ? "" : "s"} will be written from the slides and notes. Everything else is kept as files.
                    {hasOutline ? "" : " No course outline was found, so this course will have no test dates until you add one."}
                  </p>
                  <div className="mt-3"><BuildRunner course={course} files={mine.length} /></div>
                  <ul className="mt-4 space-y-2">{mine.map((file) => <FileRow key={`${file.id}-${file.how}-${file.kind}-${file.unit?.key}-${file.title}`} file={file} />)}</ul>
                </details>
              );
            })}
          </div>
        )}
      </Step>

      {cardCourses.length > 0 && (
        <Step number={5} title="Turn the notes into study cards">
          <p className="mb-4 text-sm text-slate-600">
            A built course&apos;s notes hold the text of your slides. This step has an AI write key terms, questions and the worked examples the slides show,
            and adds them to the end of each note as a &ldquo;Study cards&rdquo; section. Code checks every item against the slide text and leaves out anything it cannot find there.
          </p>
          <p className="mb-4 text-xs text-slate-500">
            {canStage()
              ? "The text of each note is sent to a free cloud AI model to be written up. It costs nothing; free models allow a limited number of requests a day, so a large course may take more than one sitting."
              : "No cloud AI is set up, so this step cannot run yet."}
            {" "}Only notes Study Coach wrote are changed. Your original files and your other vaults are not touched.
          </p>
          <ul className="space-y-4">
            {cardCourses.map(({ vault, progress }) => (
              <li key={vault.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-sm font-bold text-slate-900">{vault.name}</p>
                {progress.total === 0
                  ? <p className="text-sm text-slate-500">This course has no notes made from slides or documents.</p>
                  : <CardsRunner vaultId={vault.id} course={vault.name} initial={progress} />}
              </li>
            ))}
          </ul>
        </Step>
      )}
    </div>
  );
}
