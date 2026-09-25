import { describe, expect, it } from "vitest";
import { addDays, weekStart } from "../dates";
import { buildFocus } from "../focus";
import { areaProgress, categoryProgress, overallProgress, weeklyProgress } from "../progress";
import { buildScoreIndex, scoreDay } from "../score";
import type { Activity, AppData, Area, Category, Goal } from "../types";
import { DEFAULT_SCORE_CONFIG } from "../types";

let n = 0;
const id = () => `id-${++n}`;
const area = (p: Partial<Area> = {}): Area => ({
  id: id(), user_id: "u", name: "English", icon: "🇬🇧", color: "#3987e5", description: null, main_goal: null,
  deadline: null, progress_mode: "manual", manual_progress: 0, position: 0, archived: false, created_at: "2026-01-01T00:00:00Z", ...p,
});
const cat = (area_id: string, p: Partial<Category> = {}): Category => ({
  id: id(), user_id: "u", area_id, name: "Cat", progress: 0, progress_mode: "manual", target: null, deadline: null,
  notes: null, position: 0, created_at: "2026-01-01T00:00:00Z", ...p,
});
const goal = (p: Partial<Goal> = {}): Goal => ({
  id: id(), user_id: "u", area_id: null, category_id: null, kind: "goal", title: "G", notes: null, priority: "medium",
  deadline: null, week_start: null, scheduled_for: null, completed: false, completed_at: null, completed_on: null,
  position: 0, created_at: "2026-01-01T00:00:00Z", ...p,
});
const act = (date: string, area_id: string | null, p: Partial<Activity> = {}): Activity => ({
  id: id(), user_id: "u", date, area_id, category_id: null, goal_id: null, description: "did", minutes: null,
  created_at: `${date}T10:00:00Z`, ...p,
});

describe("dates", () => {
  it("computes Monday-based weeks", () => {
    expect(weekStart("2026-09-25")).toBe("2026-09-21"); // Friday → Monday
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
    expect(weekStart("2026-09-27", 0)).toBe("2026-09-27"); // Sunday-based
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("progress", () => {
  it("manual category progress", () => {
    const a = area();
    expect(categoryProgress(cat(a.id, { progress: 40 }), []).value).toBe(40);
  });

  it("task-based and mixed category progress", () => {
    const a = area();
    const c = cat(a.id, { progress: 20, progress_mode: "tasks" });
    const goals = [goal({ category_id: c.id, completed: true }), goal({ category_id: c.id }), goal({ category_id: c.id, kind: "weekly", completed: true })];
    expect(categoryProgress(c, goals).value).toBe(50); // weekly goals don't count
    expect(categoryProgress({ ...c, progress_mode: "mixed" }, goals).value).toBe(35);
    expect(categoryProgress({ ...c, progress_mode: "mixed" }, []).value).toBe(20); // falls back to manual
  });

  it("area = average of categories, overall = average of active areas", () => {
    const a = area();
    const b = area({ manual_progress: 60 });
    const archived = area({ manual_progress: 100, archived: true });
    const cats = [40, 20, 80, 60, 55, 45].map((p) => cat(a.id, { progress: p }));
    expect(areaProgress(a, cats, []).value).toBe(50);
    expect(areaProgress(b, cats, []).value).toBe(60);
    expect(overallProgress([a, b, archived], cats, [])).toBe(55);
  });

  it("weekly progress 2 of 4 = 50%", () => {
    const ws = "2026-09-21";
    const goals = [true, true, false, false].map((c) => goal({ kind: "weekly", week_start: ws, completed: c }));
    goals.push(goal({ kind: "weekly", week_start: "2026-09-14", completed: false })); // previous week kept separately
    expect(weeklyProgress(goals, ws)).toEqual({ done: 2, total: 4, percent: 50 });
    expect(weeklyProgress(goals, "2026-09-14")).toEqual({ done: 0, total: 1, percent: 0 });
  });
});

describe("daily score", () => {
  const d = "2026-09-25";
  it("is null with no activity and no plan", () => {
    const s = scoreDay(d, buildScoreIndex([], [], []));
    expect(s.score).toBeNull();
    expect(s.hasActivity).toBe(false);
  });

  it("is 100 for a perfect day", () => {
    const areas = ["a", "b", "c"];
    const tasks = [goal({ kind: "task", scheduled_for: d, completed: true, priority: "high" }), goal({ kind: "task", scheduled_for: d, completed: true })];
    const acts = [...areas.map((x) => act(d, x)), ...[1, 2, 3].map((i) => act(addDays(d, -i), "a"))];
    expect(scoreDay(d, buildScoreIndex(tasks, acts, [])).score).toBe(100);
  });

  it("weights components and skips ones with nothing to measure", () => {
    // 1 of 2 tasks done (no high-priority → skipped), 1 of 3 areas, no previous days.
    const tasks = [goal({ kind: "task", scheduled_for: d, completed: true }), goal({ kind: "task", scheduled_for: d })];
    const s = scoreDay(d, buildScoreIndex(tasks, [act(d, "a")], []), DEFAULT_SCORE_CONFIG);
    // (40*0.5 + 25*(1/3) + 15*0) / 80 = 35.4%
    expect(s.computed).toBe(35);
  });

  it("manual override wins", () => {
    const s = scoreDay(d, buildScoreIndex([], [act(d, "a")], [{ id: "l", user_id: "u", date: d, notes: null, manual_score: 92, created_at: "", updated_at: "" }]));
    expect(s.score).toBe(92);
    expect(s.manual).toBe(true);
  });
});

describe("focus", () => {
  const date = "2026-09-25";
  const base = (p: Partial<AppData>): AppData => ({
    areas: [], categories: [], goals: [], dailyLogs: [], activities: [], snapshots: [], stages: [], roadmapItems: [], settings: null, ...p,
  });

  it("flags the weakest category", () => {
    const a = area();
    const cats = [cat(a.id, { name: "Speaking", progress: 20 }), cat(a.id, { name: "Reading", progress: 80 }), cat(a.id, { name: "Writing", progress: 60 })];
    const f = buildFocus(base({ areas: [a], categories: cats, activities: [act(date, a.id)], goals: [goal({ kind: "task", scheduled_for: date, completed: true })] }), date, 5);
    const weak = f.find((x) => x.kind === "weakest");
    expect(weak?.title).toContain("Speaking");
  });

  it("puts overdue goals first", () => {
    const a = area();
    const g = goal({ area_id: a.id, title: "Publish video", deadline: "2026-09-20" });
    const f = buildFocus(base({ areas: [a], goals: [g], activities: [act(date, a.id)] }), date);
    expect(f[0].kind).toBe("overdue");
    expect(f[0].goalId).toBe(g.id);
  });

  it("detects neglected areas and weekly goals behind pace", () => {
    const a = area({ name: "Content" });
    const ws = weekStart(date);
    const goals = [1, 2, 3, 4, 5].map((i) => goal({ kind: "weekly", area_id: a.id, week_start: ws, completed: i <= 1 }));
    const f = buildFocus(base({ areas: [a], goals, activities: [act("2026-09-10", a.id)] }), date, 5);
    expect(f.some((x) => x.kind === "weekly")).toBe(true);
    expect(f.some((x) => x.kind === "neglected")).toBe(true);
  });
});
