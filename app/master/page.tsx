import Link from "next/link";
import { toggleCourseAction } from "@/app/master/actions";
import BudgetForm from "@/components/master/BudgetForm";
import { loadCourses } from "@/lib/master/load";
import { masterView, type MasterCourse, type MasterTask, type MasterTest } from "@/lib/master/overview";
import { daysBetween } from "@/lib/schedule/plan";
import { localToday } from "@/lib/vault/health";

export const dynamic = "force-dynamic";

const CARD = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
const LINK = "rounded underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const SMALL_BUTTON = "rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
/** One colour per course, used for its chip and its share of each week's bar. */
const COLOURS = [
  { chip: "bg-blue-100 text-blue-800", bar: "bg-blue-500" },
  { chip: "bg-violet-100 text-violet-800", bar: "bg-violet-500" },
  { chip: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500" },
  { chip: "bg-amber-100 text-amber-800", bar: "bg-amber-500" },
  { chip: "bg-rose-100 text-rose-800", bar: "bg-rose-500" },
  { chip: "bg-cyan-100 text-cyan-800", bar: "bg-cyan-500" },
  { chip: "bg-fuchsia-100 text-fuchsia-800", bar: "bg-fuchsia-500" },
  { chip: "bg-lime-100 text-lime-800", bar: "bg-lime-500" },
];
const VIEWS = [
  { id: "day", label: "Day by day" },
  { id: "week", label: "Week by week" },
  { id: "topic", label: "Topic by topic" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];
const KIND_LABEL: Record<MasterTask["kind"], string> = { learn: "Learn", practice: "Practise", review: "Review", mock: "Mock exam", "weak-spots": "Weak spots", "wind-down": "Evening before" };

function niceDate(date: string, weekday = true): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", weekday: weekday ? "long" : undefined, month: "short", day: "numeric" });
}

function hours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const value = Math.round(minutes / 6) / 10;
  return `${value} h`;
}

function away(today: string, date: string): string {
  const days = daysBetween(today, date);
  return days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

function percent(value: number | null): string {
  return value === null ? "no cards" : `${Math.round(value * 100)}%`;
}

function goHref(courseId: string, to: string): string {
  return `/master/go?${new URLSearchParams({ vault: courseId, to })}`;
}

export default async function MasterPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const requested = (await searchParams).view;
  const view: ViewId = VIEWS.some((v) => v.id === requested) ? (requested as ViewId) : "day";
  const now = new Date();
  const today = localToday(now);
  const { shown, hidden, budget, budgetChosen } = await loadCourses(now);
  const overview = masterView(shown, today, budget.minutesPerDay, budget.studyDays.length);
  const colour = new Map(shown.map((course, i) => [course.id, COLOURS[i % COLOURS.length]]));
  const byId = new Map(shown.map((course) => [course.id, course]));

  const Chip = ({ courseId }: { courseId: string }) => (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${colour.get(courseId)?.chip ?? ""}`}>{byId.get(courseId)?.code}</span>
  );
  const TaskLine = ({ task, late }: { task: MasterTask; late?: boolean }) => (
    <li className="flex items-start gap-3 py-2">
      <Chip courseId={task.courseId} />
      <div className="min-w-0 flex-1">
        <Link href={goHref(task.courseId, task.href)} className={`text-sm font-medium ${task.done ? "text-slate-400 line-through" : "text-slate-900"} ${LINK}`}>{task.title}</Link>
        <p className="text-xs text-slate-500">
          {KIND_LABEL[task.kind]} · about {task.minutes} min{task.done ? " · done" : ""}
          {late && !task.done && <span className="font-semibold text-rose-700"> · from {niceDate(task.date, false)}</span>}
        </p>
      </div>
    </li>
  );
  const TestLine = ({ test }: { test: MasterTest }) => (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <Chip courseId={test.courseId} />
      <span className="font-semibold">{test.label}</span>
      {test.assumed && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold">date assumed</span>}
      <span className="ml-auto tabular-nums">{test.readiness === null ? "no cards cover it yet" : `${percent(test.readiness)} ready`}</span>
    </li>
  );

  const withPlans = shown.filter((course) => !course.missing);
  const summaryOf = new Map(overview.summaries.map((s) => [s.courseId, s]));

  return (
    <div className="max-w-4xl mx-auto animate-fade-in space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-500">All courses</p>
        <h1 className="text-3xl font-extrabold gradient-text mb-1">Your term at a glance</h1>
        <p className="text-slate-500 text-sm">
          {shown.length === 0
            ? "No courses yet. Add a vault to start."
            : overview.endDate
              ? `Between now and ${niceDate(overview.endDate, false)}: ${overview.totals.testsLeft} test${overview.totals.testsLeft === 1 ? "" : "s"}, ${overview.totals.tasksLeft} study task${overview.totals.tasksLeft === 1 ? "" : "s"} (about ${hours(overview.totals.minutesLeft)}), and ${overview.totals.cards - overview.totals.studied} of ${overview.totals.cards} flashcards not yet studied, across ${withPlans.length} course${withPlans.length === 1 ? "" : "s"}.`
              : "None of your courses has dates yet. Open a course and read its outline on the Schedule page."}
        </p>
      </header>

      {shown.length > 0 && (
        <section aria-labelledby="courses">
          <h2 id="courses" className="sr-only">Courses</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {shown.map((course) => {
              const s = summaryOf.get(course.id)!;
              return (
                <li key={course.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Chip courseId={course.id} />
                      <p className="mt-1 truncate text-sm font-semibold text-slate-900">{course.name}</p>
                    </div>
                    <Link href={goHref(course.id, "/")} className="shrink-0 rounded-lg border border-blue-300 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Open</Link>
                  </div>
                  {course.missing ? (
                    <p className="mt-2 text-sm text-slate-500">{course.missing}</p>
                  ) : (
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div><dd className="text-lg font-bold tabular-nums text-slate-900">{s.tasksLeft}</dd><dt className="text-[11px] text-slate-500">tasks left</dt></div>
                      <div><dd className="text-lg font-bold tabular-nums text-slate-900">{hours(s.minutesLeft)}</dd><dt className="text-[11px] text-slate-500">to study</dt></div>
                      <div><dd className="text-lg font-bold tabular-nums text-slate-900">{s.studied}/{s.cards}</dd><dt className="text-[11px] text-slate-500">cards studied</dt></div>
                    </dl>
                  )}
                  <p className="mt-2 text-xs text-slate-600">
                    {s.nextTest ? <>Next: <span className="font-semibold">{s.nextTest.label}</span>, {niceDate(s.nextTest.date, false)} ({away(today, s.nextTest.date)}), {s.nextTest.readiness === null ? "no cards yet" : `${percent(s.nextTest.readiness)} ready`}</> : course.missing ? "" : "No tests ahead."}
                    {s.overdue > 0 && <span className="font-semibold text-rose-700"> · {s.overdue} overdue</span>}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {course.unchecked && <Link href={goHref(course.id, "/schedule")} className={`text-xs font-semibold text-amber-800 ${LINK}`}>Dates not checked yet</Link>}
                    <form action={toggleCourseAction} className="ml-auto">
                      <input type="hidden" name="vaultId" value={course.id} />
                      <button type="submit" className={SMALL_BUTTON}>Hide from this overview</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {withPlans.length > 0 && (
        <>
          <section aria-labelledby="budget" className={CARD}>
            <h2 id="budget" className="text-lg font-bold text-slate-900">One plan across your courses</h2>
            <p className="mt-1 mb-4 text-sm text-slate-600">
              {withPlans.length > 1
                ? `Your ${withPlans.length} courses are planned together, so no day is given more than this much study. When a day is full, a task moves to the lightest nearby day that still suits it: a first pass within two days of the class, a review within a few days of when it is due, a mock exam a little earlier.`
                : "With one course there is nothing to balance yet. This limit applies once a second course has a schedule."}
              {!budgetChosen && " This starting figure comes from the time you gave each course; change it to suit you."}
            </p>
            <BudgetForm minutesPerDay={budget.minutesPerDay} studyDays={budget.studyDays} chosen={budgetChosen} />
          </section>

          <nav aria-label="Ways to look at your term" className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
            {VIEWS.map((v) => (
              <Link key={v.id} href={v.id === "day" ? "/master" : `/master?view=${v.id}`} aria-current={view === v.id ? "page" : undefined}
                className={`flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${view === v.id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                {v.label}
              </Link>
            ))}
          </nav>

          {view === "day" && (
            <div className="space-y-4">
              {overview.overdue.length > 0 && (
                <section aria-labelledby="overdue" className={`${CARD} border-rose-200`}>
                  <h2 id="overdue" className="text-lg font-bold text-slate-900">Catch up first</h2>
                  <p className="mt-1 text-sm text-slate-600">{overview.overdue.length} task{overview.overdue.length === 1 ? "" : "s"} from earlier weeks not ticked off. Tick them on each course’s Schedule page if you have already covered them.</p>
                  <ul className="mt-2 divide-y divide-slate-100">{overview.overdue.slice(0, 6).map((task) => <TaskLine key={`${task.courseId}${task.id}`} task={task} late />)}</ul>
                  {overview.overdue.length > 6 && <p className="mt-2 text-xs text-slate-500">Showing the oldest 6 of {overview.overdue.length}.</p>}
                </section>
              )}
              {overview.days.map((day, i) => (
                <section key={day.date} aria-labelledby={`day-${day.date}`} className={CARD}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id={`day-${day.date}`} className="text-lg font-bold text-slate-900">{i === 0 ? "Today" : i === 1 ? "Tomorrow" : niceDate(day.date)}{i < 2 && <span className="ml-2 text-sm font-normal text-slate-500">{niceDate(day.date)}</span>}</h2>
                    <p className={`text-sm tabular-nums ${day.heavy ? "font-semibold text-rose-700" : "text-slate-500"}`}>
                      {day.minutes > 0 ? `about ${hours(day.minutes)}` : "nothing to study"}{day.heavy && " · more than your daily time"}
                    </p>
                  </div>
                  {day.tests.length > 0 && <ul className="mt-3 space-y-2">{day.tests.map((test) => <TestLine key={`${test.courseId}${test.label}`} test={test} />)}</ul>}
                  {day.tasks.length > 0
                    ? <ul className="mt-2 divide-y divide-slate-100">{day.tasks.map((task) => <TaskLine key={`${task.courseId}${task.id}`} task={task} late={task.date < day.date} />)}</ul>
                    : day.tests.length === 0 && <p className="mt-2 text-sm text-slate-500">A free day.</p>}
                </section>
              ))}
            </div>
          )}

          {view === "week" && (
            <section aria-labelledby="weeks" className={CARD}>
              <h2 id="weeks" className="text-lg font-bold text-slate-900">Every week to the end of term</h2>
              <p className="mt-1 mb-4 text-sm text-slate-600">Each bar is that week’s study time still to do, split by course. Tests sit on the week they fall in.</p>
              <ol className="space-y-2">
                {overview.weeks.map((week, i) => {
                  const widest = Math.max(1, ...overview.weeks.map((w) => w.minutes));
                  return (
                    <li key={week.start}>
                      <details open={i === 0} className="rounded-2xl border border-slate-200 px-4 py-3">
                        <summary className="cursor-pointer select-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                          <span className="inline-flex w-full flex-wrap items-center gap-x-3 gap-y-1 align-middle">
                            <span className="text-sm font-semibold text-slate-900">{i === 0 ? "This week" : `Week of ${niceDate(week.start, false)}`}</span>
                            {week.tests.map((test) => <span key={`${test.courseId}${test.label}`} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{byId.get(test.courseId)?.code}: {test.label}</span>)}
                            <span className={`ml-auto text-xs tabular-nums ${week.heavy ? "font-semibold text-rose-700" : "text-slate-500"}`}>{week.minutes > 0 ? hours(week.minutes) : "nothing left"}{week.heavy && " · heavy"}</span>
                          </span>
                          <span className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                            {week.byCourse.map((part) => <span key={part.courseId} className={colour.get(part.courseId)?.bar} style={{ width: `${(part.minutes / widest) * 100}%` }} />)}
                          </span>
                        </summary>
                        {week.byCourse.length > 0 && <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">{week.byCourse.map((part) => <span key={part.courseId}><Chip courseId={part.courseId} /> {part.tasks} task{part.tasks === 1 ? "" : "s"}, {hours(part.minutes)}</span>)}</p>}
                        {week.tests.length > 0 && <ul className="mt-3 space-y-2">{week.tests.map((test) => <TestLine key={`${test.courseId}${test.label}`} test={test} />)}</ul>}
                        <ul className="mt-2 divide-y divide-slate-100">{week.tasks.map((task) => <TaskLine key={`${task.courseId}${task.id}`} task={task} />)}</ul>
                      </details>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {view === "topic" && (
            <div className="space-y-4">
              {shown.filter((course: MasterCourse) => course.topics.length > 0).map((course) => (
                <section key={course.id} aria-labelledby={`topics-${course.id}`} className={CARD}>
                  <h2 id={`topics-${course.id}`} className="flex flex-wrap items-center gap-2 text-lg font-bold text-slate-900"><Chip courseId={course.id} />{course.name}</h2>
                  <ol className="mt-3 divide-y divide-slate-100">
                    {course.topics.map((topic) => (
                      <li key={topic.unitId} className="py-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <Link href={goHref(course.id, `/study/session?${new URLSearchParams({ scope: `unit:${topic.unitId}`, mode: "smart" })}`)} className={`text-sm font-semibold text-slate-900 ${LINK}`}>{topic.label}</Link>
                          <span className="text-xs tabular-nums text-slate-500">{topic.cards === 0 ? "no cards" : `${topic.studied} of ${topic.cards} cards studied · ${percent(topic.mastery)} mastered`}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-slate-100" aria-hidden="true"><div className={`h-1.5 rounded-full ${colour.get(course.id)?.bar}`} style={{ width: `${Math.round((topic.mastery ?? 0) * 100)}%` }} /></div>
                        <p className="mt-1 text-xs text-slate-500">
                          {topic.taughtOn ? `Taught ${niceDate(topic.taughtOn, false)}` : "Not matched to a class date"}
                          {topic.nextTest && ` · on ${topic.nextTest.label}, ${niceDate(topic.nextTest.date, false)}`}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {hidden.length > 0 && (
        <section aria-labelledby="hidden" className="rounded-2xl border border-dashed border-slate-300 p-4">
          <h2 id="hidden" className="text-sm font-semibold text-slate-700">Not shown here</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {hidden.map((course) => (
              <li key={course.id}>
                <form action={toggleCourseAction} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
                  <input type="hidden" name="vaultId" value={course.id} />
                  {course.name}
                  <button type="submit" className={SMALL_BUTTON}>Show</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
