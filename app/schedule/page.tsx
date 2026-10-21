import Link from "next/link";
import { redirect } from "next/navigation";
import { editScheduleAction, markEarlierDoneAction, resetScheduleAction, toggleTaskAction } from "@/app/schedule/actions";
import ConfirmForm from "@/components/schedule/ConfirmForm";
import ReadOutlineForm from "@/components/schedule/ReadOutlineForm";
import { getStudyContext } from "@/lib/learner/service";
import { listVaultPdfs } from "@/lib/problems/import";
import { plannedCourse } from "@/lib/schedule/shared-plan";
import { toLines } from "@/lib/schedule/outline";
import { addDays, byWeek, daysBetween, finalExam, shortTopic, weekStart, type PlanTask, type TaskKind } from "@/lib/schedule/plan";
import { DEFAULT_MINUTES, DEFAULT_STUDY_DAYS, getSchedule } from "@/lib/schedule/store";

const CARD = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
const SECONDARY = "rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const LIKELY_OUTLINE = /outline|syllabus|schedule/i;
const KIND_LABEL: Record<TaskKind, string> = { learn: "Learn", practice: "Practise", review: "Review", mock: "Mock exam", "weak-spots": "Weak spots", "wind-down": "Evening before" };
const KIND_CHIP: Record<TaskKind, string> = {
  learn: "bg-blue-100 text-blue-800",
  practice: "bg-violet-100 text-violet-800",
  review: "bg-emerald-100 text-emerald-800",
  mock: "bg-rose-100 text-rose-800",
  "weak-spots": "bg-amber-100 text-amber-800",
  "wind-down": "bg-slate-200 text-slate-700",
};

function niceDate(date: string, withWeekday = true): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", weekday: withWeekday ? "short" : undefined, month: "short", day: "numeric" });
}

function away(today: string, date: string): string {
  const days = daysBetween(today, date);
  if (days === 0) return "today";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} ago`;
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

function TaskRow({ task, href, done, overdue }: { task: PlanTask; href: string; done: boolean; overdue: boolean }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <form action={toggleTaskAction} className="pt-0.5">
        <input type="hidden" name="id" value={task.id} />
        <button type="submit" role="checkbox" aria-checked={done} aria-label={`${done ? "Done" : "Not done"}: ${task.title}`}
          className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 ${done ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400 bg-white text-transparent hover:border-blue-500"}`}>
          ✓
        </button>
      </form>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${done ? "text-slate-400 line-through" : "text-slate-900"}`}>
          <Link href={href} className="rounded underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{task.title}</Link>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${KIND_CHIP[task.kind]}`}>{KIND_LABEL[task.kind]}</span>
          <span className={overdue && !done ? "font-semibold text-rose-700" : ""}>{niceDate(task.date)}{overdue && !done ? " · overdue" : ""}</span>
          <span>about {task.minutes} min</span>
        </p>
      </div>
    </li>
  );
}

export default async function SchedulePage() {
  const ctx = await getStudyContext();
  if (!ctx) redirect("/vaults");
  const schedule = getSchedule(ctx.vault.id);
  const today = ctx.today;

  const heading = (
    <div className="mb-6">
      <h1 className="text-3xl font-extrabold gradient-text">Study schedule</h1>
      <p className="text-slate-500">{ctx.index.course.name}: what to do each day, built from your course outline.</p>
    </div>
  );

  if (!schedule || schedule.entries.length === 0) {
    const pdfs = listVaultPdfs(ctx.vault.path).sort((a, b) => Number(LIKELY_OUTLINE.test(b)) - Number(LIKELY_OUTLINE.test(a)));
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        {heading}
        <section aria-labelledby="read-outline" className={CARD}>
          <h2 id="read-outline" className="text-lg font-bold text-slate-900">Start from your course outline</h2>
          <p className="mt-1 mb-5 text-sm text-slate-600">
            Study Coach reads the dates of your classes and tests, then asks a few things the outline cannot tell it. If the outline gives no final exam date,
            it assumes one week after the last class until you say otherwise.
          </p>
          <ReadOutlineForm pdfs={pdfs} year={ctx.now.getFullYear()} />
        </section>
      </div>
    );
  }

  const outlineFinal = schedule.entries.find((e) => e.kind === "final");
  const entries = schedule.entries.filter((e) => e.kind !== "final");

  if (!schedule.confirmed) {
    const guess = finalExam(schedule.entries);
    const period = outlineFinal?.title.match(/exam period runs to (\d{4}-\d{2}-\d{2})/);
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        {heading}
        <section className={CARD}>
          <ConfirmForm
            lines={toLines(entries)}
            source={schedule.source}
            finalDate={schedule.finalDate ?? guess?.date ?? addDays(today, 60)}
            finalAssumed={schedule.finalAssumed}
            examPeriodEnd={schedule.finalAssumed || !period ? null : period[1]}
            testCount={entries.filter((e) => e.kind === "test").length}
            studyDays={schedule.studyDays.length > 0 ? schedule.studyDays : DEFAULT_STUDY_DAYS}
            minutesPerDay={schedule.minutesPerDay || DEFAULT_MINUTES}
          />
          <form action={resetScheduleAction} className="mt-6 border-t border-slate-200 pt-4">
            <button type="submit" className="text-sm font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              Read a different outline instead
            </button>
          </form>
        </section>
      </div>
    );
  }

  const planned = plannedCourse(ctx.vault, ctx.index, schedule);
  const built = planned.plan;
  if (!built) redirect("/vaults");
  const { finalDate, plan, hrefFor } = built;
  const done = new Set(schedule.done);

  const thisWeek = weekStart(today);
  // This week's late tasks are shown under "This week"; older ones under "Catch up".
  const overdue = plan.filter((t) => t.date < thisWeek && !done.has(t.id));
  const weeks = byWeek(plan.filter((t) => t.date >= thisWeek));
  const current = weeks.find((w) => w.start === thisWeek);
  const later = weeks.filter((w) => w.start > thisWeek);
  const tests = [...entries.filter((e) => e.kind === "test"), { date: finalDate, kind: "final" as const, title: "Final exam", chapters: [] }].filter((e) => e.date >= today);
  const finished = plan.filter((t) => done.has(t.id)).length;
  const termOver = today > finalDate;

  return (
    <div className="max-w-3xl mx-auto animate-fade-in space-y-6">
      {heading}

      {planned.shared && (
        <p className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          This plan is balanced with your other courses, so the days below already leave room for them.{" "}
          <Link href="/master" className="font-semibold underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">See every course together, or change your daily study time</Link>.
        </p>
      )}

      <section aria-labelledby="tests" className={CARD}>
        <h2 id="tests" className="text-lg font-bold text-slate-900">Tests ahead</h2>
        {termOver ? (
          <p className="mt-2 text-sm text-slate-600">The final exam date has passed. Read next term’s outline to start a new schedule.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {tests.map((test) => (
              <li key={`${test.date}${test.title}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                <span className="font-medium text-slate-900">
                  {test.kind === "final" ? "Final exam" : shortTopic(test.title)}
                  {test.kind === "final" && schedule.finalAssumed && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">assumed date</span>
                  )}
                </span>
                <span className="tabular-nums text-slate-600">{niceDate(test.date)} · {away(today, test.date)}</span>
              </li>
            ))}
          </ul>
        )}
        {schedule.finalAssumed && !termOver && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            The final exam date is a guess: one week after your last class. Update it as soon as the real date is announced.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <form action={editScheduleAction}><button type="submit" className={SECONDARY}>Change dates or study days</button></form>
          <form action={resetScheduleAction}><button type="submit" className={SECONDARY}>Read a different outline</button></form>
        </div>
      </section>

      {overdue.length > 0 && (
        <section aria-labelledby="catch-up" className={`${CARD} border-rose-200`}>
          <h2 id="catch-up" className="text-lg font-bold text-slate-900">Catch up</h2>
          <p className="mt-1 text-sm text-slate-600">
            {overdue.length} task{overdue.length === 1 ? "" : "s"} from earlier weeks not ticked off. Tick what you have already covered, and do the oldest of the rest first.
          </p>
          <form action={markEarlierDoneAction} className="mt-3">
            {overdue.map((task) => <input key={task.id} type="hidden" name="id" value={task.id} />)}
            <button type="submit" className={SECONDARY}>I have covered all of these</button>
          </form>
          <ul className="mt-2 divide-y divide-slate-100">
            {overdue.slice(0, 8).map((task) => <TaskRow key={task.id} task={task} href={hrefFor(task)} done={false} overdue />)}
          </ul>
          {overdue.length > 8 && <p className="mt-2 text-xs text-slate-500">Showing the oldest 8 of {overdue.length}.</p>}
        </section>
      )}

      <section aria-labelledby="this-week" className={CARD}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="this-week" className="text-lg font-bold text-slate-900">This week</h2>
          <p className="text-sm text-slate-500">{finished} of {plan.length} tasks done this term</p>
        </div>
        {current && current.tasks.length > 0 ? (
          <ul className="mt-2 divide-y divide-slate-100">
            {current.tasks.map((task) => <TaskRow key={task.id} task={task} href={hrefFor(task)} done={done.has(task.id)} overdue={task.date < today} />)}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-600">Nothing is planned for this week.</p>
        )}
      </section>

      {later.length > 0 && (
        <section aria-labelledby="later" className={CARD}>
          <h2 id="later" className="text-lg font-bold text-slate-900 mb-2">Coming up</h2>
          <div className="space-y-2">
            {later.map((week, i) => (
              <details key={week.start} open={i === 0} className="rounded-xl border border-slate-200 px-4 py-2">
                <summary className="cursor-pointer select-none text-sm font-semibold text-slate-800 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  Week of {niceDate(week.start, false)}
                  <span className="ml-2 font-normal text-slate-500">
                    {week.tasks.length} task{week.tasks.length === 1 ? "" : "s"} · about {Math.round(week.tasks.reduce((sum, t) => sum + t.minutes, 0) / 6) / 10} h
                  </span>
                </summary>
                <ul className="mt-1 divide-y divide-slate-100">
                  {week.tasks.map((task) => <TaskRow key={task.id} task={task} href={hrefFor(task)} done={done.has(task.id)} overdue={false} />)}
                </ul>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
