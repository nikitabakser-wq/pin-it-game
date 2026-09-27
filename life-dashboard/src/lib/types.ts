export type ProgressMode = "manual" | "tasks" | "mixed";
export type GoalKind = "goal" | "weekly" | "task";
export type Priority = "low" | "medium" | "high";

export interface Area {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  description: string | null;
  main_goal: string | null;
  deadline: string | null;
  progress_mode: ProgressMode;
  manual_progress: number;
  position: number;
  archived: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  area_id: string;
  name: string;
  progress: number;
  progress_mode: ProgressMode;
  target: string | null;
  deadline: string | null;
  notes: string | null;
  position: number;
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  area_id: string | null;
  category_id: string | null;
  kind: GoalKind;
  title: string;
  notes: string | null;
  priority: Priority;
  deadline: string | null;
  week_start: string | null;
  scheduled_for: string | null;
  completed: boolean;
  completed_at: string | null;
  completed_on: string | null;
  position: number;
  created_at: string;
}

export interface DailyLog {
  id: string;
  user_id: string;
  date: string;
  notes: string | null;
  manual_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  user_id: string;
  date: string;
  area_id: string | null;
  category_id: string | null;
  goal_id: string | null;
  description: string;
  minutes: number | null;
  created_at: string;
}

export interface ProgressSnapshot {
  id: string;
  user_id: string;
  area_id: string;
  date: string;
  progress: number;
}

export interface RoadmapStage {
  id: string;
  user_id: string;
  title: string;
  subtitle: string | null;
  start_date: string | null;
  end_date: string | null;
  position: number;
  created_at: string;
}

export interface RoadmapItem {
  id: string;
  user_id: string;
  stage_id: string;
  area_id: string | null;
  title: string;
  done: boolean;
  position: number;
  created_at: string;
}

export interface ScoreWeights {
  planned: number;
  important: number;
  coverage: number;
  consistency: number;
}

export interface ScoreConfig {
  weights: ScoreWeights;
  /** How many different areas worked on in a day count as full coverage. */
  coverageTarget: number;
  /** How many previous days are checked for the consistency component. */
  consistencyDays: number;
}

export interface UserSettings {
  user_id: string;
  display_name: string | null;
  score_config: ScoreConfig;
  week_starts_on: number;
  created_at: string;
  updated_at: string;
}

/** Everything the app loads for the signed-in user. */
export interface AppData {
  areas: Area[];
  categories: Category[];
  goals: Goal[];
  dailyLogs: DailyLog[];
  activities: Activity[];
  snapshots: ProgressSnapshot[];
  stages: RoadmapStage[];
  roadmapItems: RoadmapItem[];
  settings: UserSettings | null;
  weeklyReviews: WeeklyReview[];
}

export interface WeeklyReview {
  id: string;
  user_id: string;
  week_start: string;
  score: number | null;
  stats: WeekStats;
  summary: string | null;
  recommendations: string[];
  source: "ai" | "rules";
  final: boolean;
  seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeekDayStat {
  date: string;
  score: number | null;
  manual: boolean;
  notes: string | null;
  activities: { areaId: string | null; description: string; minutes: number | null }[];
  tasksPlanned: number;
  tasksDone: number;
}

export interface WeekAreaStat {
  areaId: string;
  name: string;
  icon: string;
  color: string;
  /** Days with at least one activity in this area. */
  days: number;
  /** Number of recorded activities (sessions). */
  sessions: number;
  minutes: number;
  prevDays: number;
}

/** Everything a weekly review is built from. Saved as a snapshot with the review. */
export interface WeekStats {
  weekStart: string;
  weekEnd: string;
  weekNumber: number;
  score: number | null;
  scoredDays: number;
  productiveDays: number;
  productiveThreshold: number;
  activeDays: number;
  days: WeekDayStat[];
  best: { date: string; score: number } | null;
  worst: { date: string; score: number } | null;
  prevScore: number | null;
  delta: number | null;
  areas: WeekAreaStat[];
  tasks: { planned: number; done: number };
  weeklyGoals: { total: number; done: number };
  goalsCompleted: number;
  minutes: number;
  patterns: string[];
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  weights: { planned: 40, important: 20, coverage: 25, consistency: 15 },
  coverageTarget: 3,
  consistencyDays: 3,
};
