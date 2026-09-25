import type { Area, Category, Goal } from "./types";

// Progress rules (kept deliberately simple and transparent):
//
// Category
//   manual → the value the user set
//   tasks  → completed / total milestone goals (kind "goal") linked to the category
//   mixed  → average of the two (falls back to manual when there are no goals)
//
// Area
//   manual → average of its categories, or the area's own manual value if it has none
//   tasks  → completed / total milestone goals (kind "goal") in the area
//   mixed  → average of the two (falls back to manual when there are no goals)
//
// Overall → average of all non-archived areas.

export interface ProgressDetail {
  value: number;
  /** Short explanation shown in the UI tooltip. */
  source: string;
  done?: number;
  total?: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function ratio(goals: Goal[]) {
  const total = goals.length;
  const done = goals.filter((g) => g.completed).length;
  return { done, total, pct: total ? (done / total) * 100 : 0 };
}

export function categoryProgress(cat: Category, goals: Goal[]): ProgressDetail {
  const linked = goals.filter((g) => g.kind === "goal" && g.category_id === cat.id);
  const r = ratio(linked);
  if (cat.progress_mode === "tasks") {
    return { value: clamp(r.pct), source: `${r.done}/${r.total} goals completed`, done: r.done, total: r.total };
  }
  if (cat.progress_mode === "mixed" && r.total > 0) {
    return {
      value: clamp((cat.progress + r.pct) / 2),
      source: `avg of manual ${cat.progress}% and goals ${r.done}/${r.total}`,
      done: r.done,
      total: r.total,
    };
  }
  return { value: clamp(cat.progress), source: "set manually" };
}

export function areaProgress(area: Area, categories: Category[], goals: Goal[]): ProgressDetail {
  const cats = categories.filter((c) => c.area_id === area.id);
  const manual: ProgressDetail = cats.length
    ? {
        value: clamp(cats.reduce((s, c) => s + categoryProgress(c, goals).value, 0) / cats.length),
        source: `average of ${cats.length} categor${cats.length === 1 ? "y" : "ies"}`,
      }
    : { value: clamp(area.manual_progress), source: "set manually" };

  const areaGoals = goals.filter((g) => g.kind === "goal" && g.area_id === area.id);
  const r = ratio(areaGoals);
  if (area.progress_mode === "tasks") {
    return { value: clamp(r.pct), source: `${r.done}/${r.total} goals completed`, done: r.done, total: r.total };
  }
  if (area.progress_mode === "mixed" && r.total > 0) {
    return {
      value: clamp((manual.value + r.pct) / 2),
      source: `avg of ${manual.source} and goals ${r.done}/${r.total}`,
      done: r.done,
      total: r.total,
    };
  }
  return manual;
}

export function overallProgress(areas: Area[], categories: Category[], goals: Goal[]): number {
  const active = areas.filter((a) => !a.archived);
  if (!active.length) return 0;
  return clamp(active.reduce((s, a) => s + areaProgress(a, categories, goals).value, 0) / active.length);
}

export interface WeeklyProgress {
  done: number;
  total: number;
  percent: number;
}

export function weeklyProgress(goals: Goal[], week: string, areaId?: string): WeeklyProgress {
  const list = goals.filter(
    (g) => g.kind === "weekly" && g.week_start === week && (!areaId || g.area_id === areaId),
  );
  const done = list.filter((g) => g.completed).length;
  return { done, total: list.length, percent: list.length ? Math.round((done / list.length) * 100) : 0 };
}
