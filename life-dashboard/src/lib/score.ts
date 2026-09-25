import { addDays } from "./dates";
import type { Activity, DailyLog, Goal, ScoreConfig } from "./types";
import { DEFAULT_SCORE_CONFIG } from "./types";

// Daily score (0–100) — built only from real actions recorded that day.
//
//   planned      completed / planned tasks scheduled for the day
//   important    completed / planned high-priority tasks for the day
//   coverage     distinct areas worked on ÷ coverage target (capped at 100%)
//   consistency  share of the previous N days that had any recorded activity
//
// Each component is 0–1 and multiplied by its weight (Settings → Daily score).
// A component with nothing to measure (e.g. no tasks planned) is left out and
// the remaining weights are scaled up so the score still reaches 100.
// A manual score on the daily log overrides the computed value.

export interface ScoreComponent {
  key: keyof ScoreConfig["weights"];
  label: string;
  weight: number;
  ratio: number | null; // null = not applicable today
  detail: string;
}

export interface DayScore {
  date: string;
  computed: number | null; // null = no activity at all
  score: number | null; // final (manual override wins)
  manual: boolean;
  components: ScoreComponent[];
  hasActivity: boolean;
  areaIds: string[];
  minutes: number;
  completedCount: number;
}

export interface ScoreIndex {
  activitiesByDate: Map<string, Activity[]>;
  tasksByDate: Map<string, Goal[]>;
  logsByDate: Map<string, DailyLog>;
}

export function buildScoreIndex(goals: Goal[], activities: Activity[], logs: DailyLog[]): ScoreIndex {
  const activitiesByDate = new Map<string, Activity[]>();
  for (const a of activities) {
    const list = activitiesByDate.get(a.date) ?? [];
    list.push(a);
    activitiesByDate.set(a.date, list);
  }
  const tasksByDate = new Map<string, Goal[]>();
  for (const g of goals) {
    if (g.kind !== "task" || !g.scheduled_for) continue;
    const list = tasksByDate.get(g.scheduled_for) ?? [];
    list.push(g);
    tasksByDate.set(g.scheduled_for, list);
  }
  const logsByDate = new Map(logs.map((l) => [l.date, l]));
  return { activitiesByDate, tasksByDate, logsByDate };
}

export function scoreDay(date: string, idx: ScoreIndex, config: ScoreConfig = DEFAULT_SCORE_CONFIG): DayScore {
  const cfg = { ...DEFAULT_SCORE_CONFIG, ...config, weights: { ...DEFAULT_SCORE_CONFIG.weights, ...config?.weights } };
  const acts = idx.activitiesByDate.get(date) ?? [];
  const tasks = idx.tasksByDate.get(date) ?? [];
  const log = idx.logsByDate.get(date);

  const doneTasks = tasks.filter((t) => t.completed);
  const important = tasks.filter((t) => t.priority === "high");
  const importantDone = important.filter((t) => t.completed);
  const areaIds = [...new Set(acts.map((a) => a.area_id).filter((x): x is string => !!x))];
  const minutes = acts.reduce((s, a) => s + (a.minutes ?? 0), 0);

  let activeBefore = 0;
  for (let i = 1; i <= cfg.consistencyDays; i++) {
    if ((idx.activitiesByDate.get(addDays(date, -i)) ?? []).length) activeBefore++;
  }

  const hasActivity = acts.length > 0;
  const components: ScoreComponent[] = [
    {
      key: "planned",
      label: "Planned tasks done",
      weight: cfg.weights.planned,
      ratio: tasks.length ? doneTasks.length / tasks.length : null,
      detail: tasks.length ? `${doneTasks.length} of ${tasks.length} planned tasks` : "no tasks planned",
    },
    {
      key: "important",
      label: "Important tasks done",
      weight: cfg.weights.important,
      ratio: important.length ? importantDone.length / important.length : null,
      detail: important.length
        ? `${importantDone.length} of ${important.length} high-priority tasks`
        : "no high-priority tasks",
    },
    {
      key: "coverage",
      label: "Areas worked on",
      weight: cfg.weights.coverage,
      ratio: Math.min(1, areaIds.length / Math.max(1, cfg.coverageTarget)),
      detail: `${areaIds.length} of ${cfg.coverageTarget} target areas`,
    },
    {
      key: "consistency",
      label: "Consistency",
      weight: cfg.weights.consistency,
      ratio: cfg.consistencyDays > 0 ? activeBefore / cfg.consistencyDays : null,
      detail: `active ${activeBefore} of previous ${cfg.consistencyDays} days`,
    },
  ];

  const applicable = components.filter((c) => c.ratio !== null && c.weight > 0);
  const totalWeight = applicable.reduce((s, c) => s + c.weight, 0);
  const anything = hasActivity || tasks.length > 0;
  const computed =
    anything && totalWeight > 0
      ? Math.round((applicable.reduce((s, c) => s + c.weight * (c.ratio ?? 0), 0) / totalWeight) * 100)
      : null;

  const manual = log?.manual_score ?? null;
  return {
    date,
    computed,
    score: manual ?? computed,
    manual: manual !== null,
    components,
    hasActivity,
    areaIds,
    minutes,
    completedCount: doneTasks.length,
  };
}

export type ScoreBand = "none" | "low" | "medium" | "high";

export function scoreBand(score: number | null): ScoreBand {
  if (score === null) return "none";
  if (score < 40) return "low";
  if (score < 75) return "medium";
  return "high";
}
