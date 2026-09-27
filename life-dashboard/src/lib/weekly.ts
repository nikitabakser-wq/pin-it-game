import { addDays, parseISODate, rangeDays, weekStart as startOfWeek } from "./dates";
import { weeklyProgress } from "./progress";
import type { DayScore } from "./score";
import type { AppData, WeekAreaStat, WeekDayStat, WeekStats } from "./types";

// Weekly Review — built only from what is already recorded in the app:
// daily scores (the existing scoreDay), activities, tasks, weekly goals and day notes.
// Nothing here invents data: a metric that cannot be derived is simply absent.

/** A day counts as productive when its daily score is at least this. */
export const PRODUCTIVE_SCORE = 60;
/** Weekly reviews are prepared from this hour on the last day of the week. */
export const REVIEW_READY_HOUR = 18;
/** How many past weeks are reviewed automatically when the app is opened. */
const BACKFILL_WEEKS = 12;

const WEEKDAYS = ["неділя", "понеділок", "вівторок", "середа", "четвер", "пʼятниця", "субота"];
const WEEKDAYS_ON = ["у неділю", "у понеділок", "у вівторок", "у середу", "у четвер", "у пʼятницю", "у суботу"];
const MONTHS = ["січ", "лют", "бер", "квіт", "трав", "черв", "лип", "серп", "вер", "жовт", "лист", "груд"];

const WEEKDAYS_SHORT = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export const weekdayName = (date: string) => WEEKDAYS[parseISODate(date).getDay()];
export const weekdayShort = (date: string) => WEEKDAYS_SHORT[parseISODate(date).getDay()];
/** "1,5 год" */
export const hoursUk = (minutes: number) => `${(Math.round(minutes / 6) / 10).toLocaleString("uk-UA")} год`;
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatWeekRangeUk(start: string): string {
  const a = parseISODate(start);
  const b = parseISODate(addDays(start, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

/** ISO-8601 week number of the week that starts on `start`. */
export function isoWeekNumber(start: string, weekStartsOn = 1): number {
  const [y, m, d] = addDays(start, weekStartsOn === 0 ? 1 : 0).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // Thursday of this ISO week
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
export const daysWord = (n: number) => `${n} ${plural(n, "день", "дні", "днів")}`;
export const sessionsWord = (n: number) => `${n} ${plural(n, "сесія", "сесії", "сесій")}`;

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

/** Rounded average of the available daily scores of a week (null = no data). */
export function weekScore(start: string, dayScore: (d: string) => DayScore): number | null {
  return average(
    rangeDays(start, addDays(start, 6))
      .map((d) => dayScore(d).score)
      .filter((s): s is number => s !== null),
  );
}

export function computeWeekStats(
  data: AppData,
  start: string,
  dayScore: (d: string) => DayScore,
): WeekStats {
  const wso = data.settings?.week_starts_on ?? 1;
  const end = addDays(start, 6);
  const dates = rangeDays(start, end);
  const inWeek = (d: string | null | undefined) => !!d && d >= start && d <= end;

  const days: WeekDayStat[] = dates.map((date) => {
    const s = dayScore(date);
    const tasks = data.goals.filter((g) => g.kind === "task" && g.scheduled_for === date);
    return {
      date,
      score: s.score,
      manual: s.manual,
      notes: data.dailyLogs.find((l) => l.date === date)?.notes ?? null,
      activities: data.activities
        .filter((a) => a.date === date)
        .map((a) => ({ areaId: a.area_id, description: a.description, minutes: a.minutes })),
      tasksPlanned: tasks.length,
      tasksDone: tasks.filter((t) => t.completed).length,
    };
  });

  const scored = days.filter((d): d is WeekDayStat & { score: number } => d.score !== null);
  const score = average(scored.map((d) => d.score));
  const best = scored.reduce<{ date: string; score: number } | null>(
    (b, d) => (!b || d.score > b.score ? { date: d.date, score: d.score } : b),
    null,
  );
  const worst = scored.reduce<{ date: string; score: number } | null>(
    (w, d) => (!w || d.score < w.score ? { date: d.date, score: d.score } : w),
    null,
  );

  const prevStart = addDays(start, -7);
  const prevScore = weekScore(prevStart, dayScore);

  const areas: WeekAreaStat[] = data.areas
    .filter((a) => !a.archived)
    .map((a) => {
      const acts = data.activities.filter((x) => x.area_id === a.id && inWeek(x.date));
      const prevDays = new Set(
        data.activities.filter((x) => x.area_id === a.id && x.date >= prevStart && x.date < start).map((x) => x.date),
      ).size;
      return {
        areaId: a.id,
        name: a.name,
        icon: a.icon,
        color: a.color,
        days: new Set(acts.map((x) => x.date)).size,
        sessions: acts.length,
        minutes: acts.reduce((s, x) => s + (x.minutes ?? 0), 0),
        prevDays,
      };
    })
    .sort((x, y) => y.days - x.days || y.sessions - x.sessions);

  const wp = weeklyProgress(data.goals, startOfWeek(start, wso));
  const stats: WeekStats = {
    weekStart: start,
    weekEnd: end,
    weekNumber: isoWeekNumber(start, wso),
    score,
    scoredDays: scored.length,
    productiveDays: scored.filter((d) => d.score >= PRODUCTIVE_SCORE).length,
    productiveThreshold: PRODUCTIVE_SCORE,
    activeDays: days.filter((d) => d.activities.length > 0).length,
    days,
    best,
    worst: scored.length >= 2 ? worst : null,
    prevScore,
    delta: score !== null && prevScore !== null ? score - prevScore : null,
    areas,
    tasks: {
      planned: days.reduce((s, d) => s + d.tasksPlanned, 0),
      done: days.reduce((s, d) => s + d.tasksDone, 0),
    },
    weeklyGoals: { total: wp.total, done: wp.done },
    goalsCompleted: data.goals.filter((g) => g.kind === "goal" && g.completed && inWeek(g.completed_on)).length,
    minutes: data.activities.filter((a) => inWeek(a.date)).reduce((s, a) => s + (a.minutes ?? 0), 0),
    patterns: [],
  };
  stats.patterns = detectPatterns(stats);
  return stats;
}

/** Factual observations about the week, used by both the rule-based and the AI analysis. */
export function detectPatterns(s: WeekStats): string[] {
  const out: string[] = [];
  const scored = s.days.filter((d) => d.score !== null) as (WeekDayStat & { score: number })[];

  const isWeekend = (d: string) => [0, 6].includes(parseISODate(d).getDay());
  const weekend = average(scored.filter((d) => isWeekend(d.date)).map((d) => d.score));
  const weekdays = average(scored.filter((d) => !isWeekend(d.date)).map((d) => d.score));
  if (weekend !== null && weekdays !== null && Math.abs(weekend - weekdays) >= 15) {
    out.push(`Середній бал у вихідні — ${weekend}, у будні — ${weekdays}.`);
  }

  let run = 0;
  let longest = 0;
  for (const d of s.days) {
    run = d.activities.length ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  if (longest >= 3) out.push(`Найдовша серія активних днів — ${longest} поспіль.`);

  const empty = 7 - s.activeDays;
  if (empty >= 2) out.push(`${capitalize(daysWord(empty))} без жодного запису.`);

  const unplanned = s.days.filter((d) => d.tasksPlanned === 0).length;
  if (unplanned >= 3) out.push(`${capitalize(daysWord(unplanned))} без запланованих задач.`);

  let lowRun = 0;
  let worstLowRun = 0;
  for (const d of s.days) {
    lowRun = d.score !== null && d.score < 40 ? lowRun + 1 : 0;
    worstLowRun = Math.max(worstLowRun, lowRun);
  }
  if (worstLowRun >= 2) out.push(`${capitalize(daysWord(worstLowRun))} поспіль з балом нижче 40.`);

  for (const a of s.areas) {
    if (a.days === 0 && a.prevDays > 0) out.push(`${a.name}: цього тижня 0 днів (минулого — ${a.prevDays}).`);
    else if (a.prevDays > 0 && a.days - a.prevDays >= 2) out.push(`${a.name}: ${a.days} дн. проти ${a.prevDays} минулого тижня.`);
  }
  if (s.weeklyGoals.total > 0) out.push(`Тижневі цілі: ${s.weeklyGoals.done} з ${s.weeklyGoals.total}.`);
  return out;
}

export interface WeekAnalysis {
  summary: string;
  recommendations: string[];
}

/** Built-in analysis: honest, short and based only on the numbers above. */
export function ruleAnalysis(s: WeekStats): WeekAnalysis {
  if (s.score === null) {
    return { summary: "За цей тиждень немає оцінок днів — недостатньо даних для аналізу.", recommendations: [] };
  }
  const parts: string[] = [];

  if (s.delta === null) parts.push(`Тиждень завершено з оцінкою ${s.score}/100.`);
  else if (s.delta >= 3) parts.push(`Тиждень сильніший за попередній на ${s.delta} ${plural(s.delta, "бал", "бали", "балів")} — ${s.score}/100.`);
  else if (s.delta <= -3) parts.push(`Тиждень слабший за попередній на ${-s.delta} ${plural(-s.delta, "бал", "бали", "балів")} — ${s.score}/100.`);
  else parts.push(`Тиждень на рівні попереднього — ${s.score}/100.`);

  const active = s.areas.filter((a) => a.days > 0);
  if (active.length) {
    const top = active.filter((a) => a.days === active[0].days).slice(0, 2);
    parts.push(`${top.length > 1 ? "Найстабільнішими були" : "Найстабільнішим напрямом був"} ${top.map((a) => a.name).join(" та ")} — ${daysWord(top[0].days)}.`);
  }
  const weak = [...s.areas].sort((x, y) => x.days - y.days || y.prevDays - x.prevDays)[0];
  if (weak && s.areas.length > 1 && weak.days <= 2 && !(active.length && weak.areaId === active[0].areaId)) {
    parts.push(
      weak.days === 0
        ? `Найбільша просадка — ${weak.name}: цього тижня жодного дня.`
        : `Найбільша просадка — ${weak.name}: лише ${daysWord(weak.days)}.`,
    );
  }
  if (s.productiveDays >= 5) parts.push(`${s.productiveDays} з 7 днів були продуктивними — це сильний ритм.`);
  else if (s.scoredDays > 0 && s.productiveDays <= 2) parts.push(`Продуктивних днів лише ${s.productiveDays} — ритм поки нестабільний.`);
  if (s.scoredDays < 4) parts.push(`Оцінки є лише за ${daysWord(s.scoredDays)}, тож висновки приблизні.`);

  const recs: string[] = [];
  if (weak && weak.days <= 1 && s.areas.length > 1) {
    recs.push(`Заплануй ${weak.name} хоча б на 3 дні — постав задачі заздалегідь, наприклад на пн, ср і пт.`);
  }
  if (s.weeklyGoals.total > 0 && s.weeklyGoals.done / s.weeklyGoals.total < 0.5) {
    const cap = Math.max(2, s.weeklyGoals.done + 1);
    recs.push(`Закрито ${s.weeklyGoals.done} з ${s.weeklyGoals.total} тижневих цілей. Наступного тижня постав не більше ${cap} — і доведи їх до кінця.`);
  }
  if (s.worst && s.score - s.worst.score >= 20) {
    recs.push(`Найслабший день — ${weekdayName(s.worst.date)} (${s.worst.score}). Постав ${WEEKDAYS_ON[parseISODate(s.worst.date).getDay()]} 1–2 легкі задачі, щоб не випадати з ритму.`);
  }
  const unplanned = s.days.filter((d) => d.tasksPlanned === 0).length;
  if (unplanned >= 3) recs.push(`${capitalize(daysWord(unplanned))} були без запланованих задач. Щовечора став 2–4 задачі на завтра — так бал відображає твій план.`);
  if (7 - s.activeDays >= 3) recs.push(`${capitalize(daysWord(7 - s.activeDays))} без жодного запису. Навіть 15 хвилин і одна галочка зберігають серію.`);
  if (!recs.length) {
    const top = active[0];
    recs.push(
      top
        ? `Тримай той самий ритм і додай одну амбітнішу тижневу ціль у ${top.name}.`
        : "Постав на наступний тиждень 2–3 тижневі цілі та щодня відмічай зроблене.",
    );
  }
  return { summary: parts.join(" "), recommendations: recs.slice(0, 3) };
}

/** Short text for the "review is ready" banner / notification. */
export function reviewNotification(s: WeekStats): { title: string; body: string } {
  const bits: string[] = [];
  if (s.scoredDays) bits.push(`${s.productiveDays} ${plural(s.productiveDays, "продуктивний день", "продуктивні дні", "продуктивних днів")}`);
  for (const a of s.areas.filter((x) => x.days > 0).slice(0, 2)) bits.push(`${a.name} — ${daysWord(a.days)}`);
  return {
    title: "🏆 Тижневий підсумок готовий!",
    body: `Цього тижня: ${s.score ?? "—"}/100.${bits.length ? ` ${capitalize(bits.join(", "))}.` : ""}`,
  };
}

/** Compact fingerprint of the data a review depends on — used to refresh a running week's review. */
export function statsSignature(s: WeekStats): string {
  return JSON.stringify([
    s.score,
    s.prevScore,
    s.days.map((d) => [d.score, d.activities.length, d.tasksPlanned, d.tasksDone, d.notes]),
    s.areas.map((a) => [a.areaId, a.days, a.sessions, a.minutes]),
    s.weeklyGoals,
    s.goalsCompleted,
  ]);
}

export interface ReviewDue {
  weekStart: string;
  /** false when the week is still running (prepared on its last evening). */
  final: boolean;
}

/**
 * Weeks that should have a review right now: every completed week since the first
 * recorded data (at most BACKFILL_WEEKS back), plus the current week from the evening
 * of its last day.
 */
export function reviewsDue(now: Date, weekStartsOn: number, firstDataDate: string | null): ReviewDue[] {
  if (!firstDataDate) return [];
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const current = startOfWeek(today, weekStartsOn);
  const firstWeek = startOfWeek(firstDataDate, weekStartsOn);
  const out: ReviewDue[] = [];
  for (let i = 1; i <= BACKFILL_WEEKS; i++) {
    const w = addDays(current, -7 * i);
    if (w < firstWeek) break;
    out.push({ weekStart: w, final: true });
  }
  if (today === addDays(current, 6) && now.getHours() >= REVIEW_READY_HOUR && current >= firstWeek) {
    out.unshift({ weekStart: current, final: false });
  }
  return out;
}

/** Earliest date with anything recorded (activity, log or planned task). */
export function firstDataDate(data: AppData): string | null {
  const dates = [
    ...data.activities.map((a) => a.date),
    ...data.dailyLogs.map((l) => l.date),
    ...data.goals.filter((g) => g.kind === "task" && g.scheduled_for).map((g) => g.scheduled_for!),
  ];
  return dates.length ? dates.reduce((m, d) => (d < m ? d : m)) : null;
}

/** Structured input for the AI analysis — only facts from the app. */
export function aiPayload(s: WeekStats) {
  const areaName = (id: string | null) => s.areas.find((a) => a.areaId === id)?.name ?? null;
  return {
    week: { start: s.weekStart, end: s.weekEnd, number: s.weekNumber },
    weekScore: s.score,
    previousWeekScore: s.prevScore,
    scoredDays: s.scoredDays,
    productiveDays: s.productiveDays,
    productiveThreshold: s.productiveThreshold,
    days: s.days.map((d) => ({
      date: d.date,
      weekday: weekdayName(d.date),
      score: d.score,
      scoreSetManually: d.manual,
      notes: d.notes,
      tasks: { planned: d.tasksPlanned, done: d.tasksDone },
      activities: d.activities.map((a) => ({ area: areaName(a.areaId), what: a.description, minutes: a.minutes })),
    })),
    areas: s.areas.map((a) => ({ name: a.name, activeDays: a.days, sessions: a.sessions, minutes: a.minutes, previousWeekDays: a.prevDays })),
    weeklyGoals: s.weeklyGoals,
    bestDay: s.best && { weekday: weekdayName(s.best.date), score: s.best.score },
    weakestDay: s.worst && { weekday: weekdayName(s.worst.date), score: s.worst.score },
    detectedPatterns: s.patterns,
  };
}
