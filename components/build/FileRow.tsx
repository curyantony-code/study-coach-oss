import { removeFileAction, updateFileAction } from "@/app/build/actions";
import type { InboxFile } from "@/lib/build/store";
import { KIND_LABELS, KINDS } from "@/lib/build/tags";
import { INPUT, SECONDARY } from "./styles";

const HOW: Record<InboxFile["how"], string> = { "": "", rules: "Tagged by rules", model: "Tagged with the small model", you: "Set by you" };

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** One file with its tags, each of which the student can correct. */
export default function FileRow({ file }: { file: InboxFile }) {
  const formId = `file-${file.id}`;
  const label = (field: string) => `${formId}-${field}`;
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="break-words text-sm font-semibold text-slate-900">{file.name}</p>
      <p className="text-xs text-slate-500">
        {size(file.bytes)}{file.pages > 0 ? ` · ${file.pages} pages` : ""}{HOW[file.how] ? ` · ${HOW[file.how]}` : ""}
      </p>
      {file.problem && <p className="mt-1 text-xs text-amber-800">{file.problem}</p>}
      <form id={formId} action={updateFileAction} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[7rem_10rem_8rem_1fr]">
        <input type="hidden" name="id" value={file.id} />
        <div>
          <label htmlFor={label("course")} className="block text-xs font-medium text-slate-600">Course</label>
          <input id={label("course")} name="course" defaultValue={file.course ?? ""} placeholder="FIN 101" autoComplete="off" className={`${INPUT} w-full`} />
        </div>
        <div>
          <label htmlFor={label("kind")} className="block text-xs font-medium text-slate-600">Kind</label>
          <select id={label("kind")} name="kind" defaultValue={file.kind} className={`${INPUT} w-full`}>
            {KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={label("unit")} className="block text-xs font-medium text-slate-600">Unit</label>
          <input id={label("unit")} name="unit" defaultValue={file.unit?.label ?? ""} placeholder="Chapter 7" autoComplete="off" className={`${INPUT} w-full`} />
        </div>
        <div>
          <label htmlFor={label("title")} className="block text-xs font-medium text-slate-600">Title</label>
          <input id={label("title")} name="title" defaultValue={file.title} autoComplete="off" className={`${INPUT} w-full`} />
        </div>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="submit" form={formId} className={SECONDARY}>Save changes</button>
        <form action={removeFileAction}>
          <input type="hidden" name="id" value={file.id} />
          <button type="submit" className="rounded-xl px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 active:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">Leave this file out</button>
        </form>
      </div>
    </li>
  );
}
