import { describe, expect, it } from "vitest";
import { addDays } from "../dates";
import { buildScoreIndex, scoreDay } from "../score";
import type { Activity, AppData, Area, DailyLog, Goal } from "../types";
import { computeWeekStats, firstDataDate, isoWeekNumber, reviewNotification, reviewsDue, ruleAnalysis, weekScore } from "../weekly";

let n = 0;
const id = () => `w-${++n}`;
const area = (name: string): Area => ({
  id: id(), user_id: "u", name, icon: "•", color: "#3987e5", description: null, main_goal: null, deadline: null,
  progress_mode: "manual", manual_progress: 0, position: 0, archived: false, created_at: "2026-01-01T00:00:00Z",
});
const act = (date: string, area_id: string, minutes: number | null = null): Activity => ({
  id: id(), user_id: "u", date, area_id, category_id: null, goal_id: null, description: "x", minutes, created_at: `${date}T10:00:00Z`,
});
const log = (date: string, manual_score: number | null, notes: string | null = null): DailyLog => ({
  id: id(), user_id: "u", date, notes, manual_score, created_at: "", updated_at: "",
});
const base = (p: Partial<AppData>): AppData => ({
  areas: [], categories: [], goals: [], dailyLogs: [], activities: [], snapshots: [], stages: [], roadmapItems: [],
  settings: null, weeklyReviews: [], ...p,
});
const scorer = (d: AppData) => {
  const idx = buildScoreIndex(d.goals, d.activities, d.dailyLogs);
  return (date: string) => scoreDay(date, idx);
};

const WEEK = "2026-09-21"; // Monday, ISO week 39

describe("weekly review", () => {
  it("averages the existing daily scores and rounds", () => {
    // Manual scores make the example exact: 82 91 76 94 88 73 95 → 85.57 → 86
    const scores = [82, 91, 76, 94, 88, 73, 95];
    const gym = area("Gym");
    const d = base({
      areas: [gym],
      activities: scores.map((_, i) => act(addDays(WEEK, i), gym.id)),
      dailyLogs: scores.map((s, i) => log(addDays(WEEK, i), s)),
    });
    const s = computeWeekStats(d, WEEK, scorer(d));
    expect(s.score).toBe(86);
    expect(s.weekNumber).toBe(39);
    expect(s.best).toEqual({ date: "2026-09-27", score: 95 });
    expect(s.worst).toEqual({ date: "2026-09-26", score: 73 });
    expect(s.productiveDays).toBe(7);
    expect(s.areas[0]).toMatchObject({ name: "Gym", days: 7, sessions: 7 });
  });

  it("ignores days without a score and compares with the previous week", () => {
    const en = area("English");
    const d = base({
      areas: [en],
      activities: [act("2026-09-15", en.id), act(WEEK, en.id), act("2026-09-23", en.id)],
      dailyLogs: [log("2026-09-15", 70), log(WEEK, 80), log("2026-09-23", 90)],
    });
    const s = computeWeekStats(d, WEEK, scorer(d));
    expect(s.scoredDays).toBe(2);
    expect(s.score).toBe(85);
    expect(s.prevScore).toBe(70);
    expect(s.delta).toBe(15);
    expect(s.areas[0]).toMatchObject({ days: 2, prevDays: 1 });
  });

  it("returns no score (not a fake one) for an empty week", () => {
    const d = base({ areas: [area("Gym")] });
    const s = computeWeekStats(d, WEEK, scorer(d));
    expect(s.score).toBeNull();
    expect(s.best).toBeNull();
    expect(weekScore(WEEK, scorer(d))).toBeNull();
    expect(ruleAnalysis(s).recommendations).toEqual([]);
  });

  it("only uses real metrics and flags neglected areas honestly", () => {
    const gym = area("Gym");
    const en = area("English");
    const d = base({
      areas: [gym, en],
      activities: [0, 1, 2, 3].map((i) => act(addDays(WEEK, i), gym.id, 60)),
      dailyLogs: [0, 1, 2, 3].map((i) => log(addDays(WEEK, i), 70)),
    });
    const s = computeWeekStats(d, WEEK, scorer(d));
    expect(s.minutes).toBe(240);
    expect(s.weeklyGoals.total).toBe(0);
    const a = ruleAnalysis(s);
    expect(a.summary).toContain("Gym");
    expect(a.summary).toContain("English");
    expect(a.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(a.recommendations.length).toBeLessThanOrEqual(3);
    expect(a.recommendations.join(" ")).toContain("English");
    expect(reviewNotification(s).body).toContain("Цього тижня: 70/100");
  });

  it("counts weekly goals of that week only", () => {
    const g = (week_start: string, completed: boolean): Goal => ({
      id: id(), user_id: "u", area_id: null, category_id: null, kind: "weekly", title: "g", notes: null, priority: "medium",
      deadline: null, week_start, scheduled_for: null, completed, completed_at: null, completed_on: null, position: 0, created_at: "",
    });
    const d = base({ goals: [g(WEEK, true), g(WEEK, false), g("2026-09-14", true)], dailyLogs: [log(WEEK, 50)] });
    expect(computeWeekStats(d, WEEK, scorer(d)).weeklyGoals).toEqual({ total: 2, done: 1 });
  });
});

describe("when reviews are due", () => {
  it("covers finished weeks since the first data, never the future", () => {
    const monday = new Date(2026, 8, 28, 9); // Mon 28 Sep 2026
    expect(reviewsDue(monday, 1, "2026-09-16").map((w) => w.weekStart)).toEqual(["2026-09-21", "2026-09-14"]);
    expect(reviewsDue(monday, 1, null)).toEqual([]);
  });

  it("prepares the current week on its last evening as not final", () => {
    const sundayEvening = new Date(2026, 8, 27, 19);
    const sundayMorning = new Date(2026, 8, 27, 9);
    expect(reviewsDue(sundayEvening, 1, "2026-09-22")[0]).toEqual({ weekStart: "2026-09-21", final: false });
    expect(reviewsDue(sundayMorning, 1, "2026-09-22")).toEqual([]);
  });

  it("iso week numbers and first data date", () => {
    expect(isoWeekNumber("2026-09-21")).toBe(39);
    expect(isoWeekNumber("2026-12-28")).toBe(53);
    expect(isoWeekNumber("2027-01-04")).toBe(1);
    expect(isoWeekNumber("2026-09-20", 0)).toBe(39);
    expect(firstDataDate(base({ dailyLogs: [log("2026-09-10", null)], activities: [act("2026-09-12", "a")] }))).toBe("2026-09-10");
  });
});
