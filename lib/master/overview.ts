// Every course at once: what is due each day, how heavy each week is, and where each topic
// stands. Pure: given each course's plan and progress, it only arranges them.
import { addDays, weekStart, type TaskKind } from "../schedule/plan";

export interface MasterTask {
  courseId: string;
  id: string;
  date: string;
  kind: TaskKind;
  title: string;
  minutes: number;
  done: boolean;
  /** Address inside the course. */
  href: string;
}

export interface MasterTest {
  courseId: string;
  label: string;
  date: string;
  /** True while the date is a guess (a final assumed a week after the last class). */
  assumed: boolean;
  /** Predicted recall on the day, 0 to 1; null when no cards cover the test. */
  readiness: number | null;
}

export interface MasterTopic {
  courseId: string;
  unitId: string;
  label: string;
  cards: number;
  studied: number;
  /** 0 to 1; null when the topic has no cards. */
  mastery: number | null;
  /** The first class on this topic, when the outline says. */
  taughtOn: string | null;
  /** The next test that covers it. */
  nextTest: { label: string; date: string } | null;
}

export interface MasterCourse {
  id: string;
  name: string;
  /** Short label for chips, e.g. "FIN 101". */
  code: string;
  /** Why the course has no plan, or null when it has one. */
  missing: string | null;
  /** True while its dates were read from the outline but not yet checked by the student. */
  unchecked: boolean;
  tasks: MasterTask[];
  tests: MasterTest[];
  topics: MasterTopic[];
}

/** More planned study than this in one day is flagged, when the student has not set their own limit. */
export const HEAVY_DAY_MINUTES = 180;
export const DAYS_SHOWN = 7;
/** A term, with room to spare. */
export const MAX_WEEKS = 60;

export interface MasterDay {
  date: string;
  tasks: MasterTask[];
  tests: MasterTest[];
  minutes: number;
  heavy: boolean;
}

export interface MasterWeek {
  start: string;
  tests: MasterTest[];
  tasks: MasterTask[];
  /** Minutes still to do, per course. */
  byCourse: { courseId: string; minutes: number; tasks: number }[];
  minutes: number;
  /** True when the week averages more than a heavy day's worth on each of six days. */
  heavy: boolean;
}

export interface CourseSummary {
  courseId: string;
  tasksLeft: number;
  minutesLeft: number;
  testsLeft: number;
  nextTest: MasterTest | null;
  cards: number;
  studied: number;
  overdue: number;
}

export interface MasterView {
  /** The last test across every course: "the end of the year". */
  endDate: string | null;
  overdue: MasterTask[];
  days: MasterDay[];
  weeks: MasterWeek[];
  summaries: CourseSummary[];
  totals: { tasksLeft: number; minutesLeft: number; testsLeft: number; cards: number; studied: number };
}

const byDate = <T extends { date: string }>(a: T, b: T) => a.date.localeCompare(b.date);

/**
 * Arranges every course's plan around `today` (YYYY-MM-DD). `dayLimit` is the study time the
 * student has on a study day, and `studyDaysPerWeek` how many of those a week has.
 */
export function masterView(courses: MasterCourse[], today: string, dayLimit: number = HEAVY_DAY_MINUTES, studyDaysPerWeek = 6): MasterView {
  const tasks = courses.flatMap((course) => course.tasks).sort((a, b) => byDate(a, b) || a.title.localeCompare(b.title));
  const tests = courses.flatMap((course) => course.tests).sort(byDate);
  const ahead = tests.filter((test) => test.date >= today);
  const open = tasks.filter((task) => !task.done);
  const thisWeek = weekStart(today);

  const days: MasterDay[] = Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const date = addDays(today, i);
    // Today also carries this week's unfinished tasks from earlier days, so nothing recent is lost.
    const due = tasks.filter((task) => task.date === date || (i === 0 && !task.done && task.date >= thisWeek && task.date < today));
    const minutes = due.filter((task) => !task.done).reduce((sum, task) => sum + task.minutes, 0);
    return { date, tasks: due, tests: tests.filter((test) => test.date === date), minutes, heavy: minutes > dayLimit };
  });

  // A misread date years away must not draw years of empty weeks.
  const horizon = addDays(thisWeek, MAX_WEEKS * 7);
  const last = [...ahead.map((test) => test.date), ...open.map((task) => task.date)].filter((date) => date < horizon).sort().at(-1) ?? null;
  const weeks: MasterWeek[] = [];
  for (let start = thisWeek; last !== null && start <= last; start = addDays(start, 7)) {
    const end = addDays(start, 7);
    const inWeek = tasks.filter((task) => task.date >= start && task.date < end);
    const left = inWeek.filter((task) => !task.done);
    const byCourse = courses
      .map((course) => {
        const mine = left.filter((task) => task.courseId === course.id);
        return { courseId: course.id, minutes: mine.reduce((sum, task) => sum + task.minutes, 0), tasks: mine.length };
      })
      .filter((entry) => entry.tasks > 0);
    const minutes = byCourse.reduce((sum, entry) => sum + entry.minutes, 0);
    weeks.push({ start, tests: tests.filter((test) => test.date >= start && test.date < end), tasks: inWeek, byCourse, minutes, heavy: minutes > dayLimit * studyDaysPerWeek });
  }

  const summaries = courses.map((course): CourseSummary => {
    const left = course.tasks.filter((task) => !task.done);
    const coming = course.tests.filter((test) => test.date >= today).sort(byDate);
    return {
      courseId: course.id,
      tasksLeft: left.filter((task) => task.date >= thisWeek).length,
      minutesLeft: left.filter((task) => task.date >= thisWeek).reduce((sum, task) => sum + task.minutes, 0),
      testsLeft: coming.length,
      nextTest: coming[0] ?? null,
      cards: course.topics.reduce((sum, topic) => sum + topic.cards, 0),
      studied: course.topics.reduce((sum, topic) => sum + topic.studied, 0),
      overdue: left.filter((task) => task.date < thisWeek).length,
    };
  });
  const total = (pick: (summary: CourseSummary) => number) => summaries.reduce((sum, summary) => sum + pick(summary), 0);

  return {
    endDate: tests.at(-1)?.date ?? null,
    overdue: open.filter((task) => task.date < thisWeek),
    days,
    weeks,
    summaries,
    totals: { tasksLeft: total((s) => s.tasksLeft), minutesLeft: total((s) => s.minutesLeft), testsLeft: ahead.length, cards: total((s) => s.cards), studied: total((s) => s.studied) },
  };
}

/** "FIN 101 Teacher" → "FIN 101"; a name with no course code is shortened instead. */
export function courseCode(name: string, code?: string): string {
  if (code) return code;
  const found = name.match(/(?<![A-Za-z])([A-Za-z]{2,5})[ _-]?(\d{3}[A-Za-z]?)(?![A-Za-z0-9])/);
  return found ? `${found[1].toUpperCase()} ${found[2]}` : name.length > 14 ? `${name.slice(0, 13).trimEnd()}…` : name;
}
