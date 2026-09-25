"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase/client";
import { today } from "./dates";
import { areaProgress } from "./progress";
import { buildScoreIndex, scoreDay, type DayScore } from "./score";
import { templateAreas, templateRoadmap } from "./template";
import type {
  Activity,
  AppData,
  Area,
  Category,
  DailyLog,
  Goal,
  ProgressSnapshot,
  RoadmapItem,
  RoadmapStage,
  ScoreConfig,
  UserSettings,
} from "./types";
import { DEFAULT_SCORE_CONFIG } from "./types";

// Table name → row type and the AppData key that holds it.
interface Tables {
  areas: Area;
  categories: Category;
  goals: Goal;
  daily_logs: DailyLog;
  activities: Activity;
  progress_snapshots: ProgressSnapshot;
  roadmap_stages: RoadmapStage;
  roadmap_items: RoadmapItem;
}
type TableName = keyof Tables;
type ListKey = Exclude<keyof AppData, "settings">;

const KEY: Record<TableName, ListKey> = {
  areas: "areas",
  categories: "categories",
  goals: "goals",
  daily_logs: "dailyLogs",
  activities: "activities",
  progress_snapshots: "snapshots",
  roadmap_stages: "stages",
  roadmap_items: "roadmapItems",
};

// Deleting these cascades in the database, so the whole dataset is reloaded afterwards.
const CASCADING: TableName[] = ["areas", "categories", "goals", "roadmap_stages"];

const EMPTY: AppData = {
  areas: [],
  categories: [],
  goals: [],
  dailyLogs: [],
  activities: [],
  snapshots: [],
  stages: [],
  roadmapItems: [],
  settings: null,
};

type Row<T extends TableName> = Tables[T];
type NewRow<T extends TableName> = Partial<Omit<Row<T>, "id" | "user_id" | "created_at">>;

export interface Store {
  user: User | null;
  data: AppData;
  loading: boolean;
  error: string | null;
  scoreConfig: ScoreConfig;
  reload: () => Promise<void>;
  insert: <T extends TableName>(table: T, row: NewRow<T>) => Promise<Row<T>>;
  update: <T extends TableName>(table: T, id: string, patch: NewRow<T>) => Promise<Row<T>>;
  remove: (table: TableName, id: string) => Promise<void>;
  toggleGoal: (goal: Goal, onDate?: string) => Promise<void>;
  saveLog: (date: string, patch: Partial<Pick<DailyLog, "notes" | "manual_score">>) => Promise<void>;
  saveSettings: (patch: Partial<Pick<UserSettings, "display_name" | "score_config" | "week_starts_on">>) => Promise<void>;
  applyTemplate: () => Promise<void>;
  dayScore: (date: string) => DayScore;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside <DataProvider>");
  return s;
}

function byPosition<T extends { position?: number; created_at?: string }>(a: T, b: T) {
  return (a.position ?? 0) - (b.position ?? 0) || (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<AppData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((e: unknown): never => {
    const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
    setError(msg);
    throw e instanceof Error ? e : new Error(msg);
  }, []);

  const reload = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    setUser(auth.user);
    if (!auth.user) {
      setLoading(false);
      return;
    }
    const q = <T,>(table: string) => supabase.from(table).select("*").then(({ data, error }) => {
      if (error) throw error;
      return (data ?? []) as T[];
    });
    try {
      const [areas, categories, goals, dailyLogs, activities, snapshots, stages, roadmapItems, settingsRows] =
        await Promise.all([
          q<Area>("areas"),
          q<Category>("categories"),
          q<Goal>("goals"),
          q<DailyLog>("daily_logs"),
          q<Activity>("activities"),
          q<ProgressSnapshot>("progress_snapshots"),
          q<RoadmapStage>("roadmap_stages"),
          q<RoadmapItem>("roadmap_items"),
          q<UserSettings>("user_settings"),
        ]);
      let settings = settingsRows[0] ?? null;
      if (!settings) {
        const { data: created, error } = await supabase
          .from("user_settings")
          .upsert({ user_id: auth.user.id }, { onConflict: "user_id" })
          .select()
          .single();
        if (error) throw error;
        settings = created as UserSettings;
      }
      setData({
        areas: areas.sort(byPosition),
        categories: categories.sort(byPosition),
        goals: goals.sort(byPosition),
        dailyLogs,
        activities,
        snapshots,
        stages: stages.sort(byPosition),
        roadmapItems: roadmapItems.sort(byPosition),
        settings,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    // Initial load: fetch the signed-in user's data once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const insert: Store["insert"] = useCallback(
    async (table, row) => {
      const { data: created, error } = await supabase.from(table).insert(row as never).select().single();
      if (error) fail(error);
      const key = KEY[table];
      setData((d) => ({ ...d, [key]: [...(d[key] as unknown[]), created].sort(byPosition as never) }));
      return created as Row<typeof table>;
    },
    [supabase, fail],
  );

  const update: Store["update"] = useCallback(
    async (table, id, patch) => {
      const { data: saved, error } = await supabase.from(table).update(patch as never).eq("id", id).select().single();
      if (error) fail(error);
      const key = KEY[table];
      setData((d) => ({
        ...d,
        [key]: (d[key] as { id: string }[]).map((r) => (r.id === id ? saved : r)).sort(byPosition as never),
      }));
      return saved as Row<typeof table>;
    },
    [supabase, fail],
  );

  const remove: Store["remove"] = useCallback(
    async (table, id) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) fail(error);
      if (CASCADING.includes(table)) {
        await reload();
        return;
      }
      const key = KEY[table];
      setData((d) => ({ ...d, [key]: (d[key] as { id: string }[]).filter((r) => r.id !== id) }));
    },
    [supabase, fail, reload],
  );

  const toggleGoal: Store["toggleGoal"] = useCallback(
    async (goal, onDate) => {
      const completing = !goal.completed;
      const date = onDate ?? today();
      await update("goals", goal.id, {
        completed: completing,
        completed_at: completing ? new Date().toISOString() : null,
        completed_on: completing ? date : null,
      });
      if (completing) {
        // Every completed goal is recorded as an action for that day.
        await insert("activities", {
          date,
          area_id: goal.area_id,
          category_id: goal.category_id,
          goal_id: goal.id,
          description: goal.title,
          minutes: null,
        });
      } else {
        const { error } = await supabase.from("activities").delete().eq("goal_id", goal.id);
        if (error) fail(error);
        setData((d) => ({ ...d, activities: d.activities.filter((a) => a.goal_id !== goal.id) }));
      }
    },
    [update, insert, supabase, fail],
  );

  const saveLog: Store["saveLog"] = useCallback(
    async (date, patch) => {
      if (!user) return;
      const { data: saved, error } = await supabase
        .from("daily_logs")
        .upsert({ user_id: user.id, date, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id,date" })
        .select()
        .single();
      if (error) fail(error);
      setData((d) => ({
        ...d,
        dailyLogs: [...d.dailyLogs.filter((l) => l.date !== date), saved as DailyLog],
      }));
    },
    [supabase, user, fail],
  );

  const saveSettings: Store["saveSettings"] = useCallback(
    async (patch) => {
      if (!user) return;
      const { data: saved, error } = await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
        .select()
        .single();
      if (error) fail(error);
      setData((d) => ({ ...d, settings: saved as UserSettings }));
    },
    [supabase, user, fail],
  );

  const applyTemplate: Store["applyTemplate"] = useCallback(async () => {
    const base = data.areas.length;
    for (const [i, t] of templateAreas.entries()) {
      const { categories, ...area } = t;
      const { data: a, error } = await supabase
        .from("areas")
        .insert({ ...area, position: base + i })
        .select()
        .single();
      if (error) fail(error);
      if (categories.length) {
        const { error: e2 } = await supabase
          .from("categories")
          .insert(categories.map((name, j) => ({ area_id: (a as Area).id, name, position: j })));
        if (e2) fail(e2);
      }
    }
    if (!data.stages.length) {
      const { data: s, error } = await supabase.from("roadmap_stages").insert(templateRoadmap.stage).select().single();
      if (error) fail(error);
      const { data: areas } = await supabase.from("areas").select("id,name");
      const items = templateRoadmap.items.map((it, j) => ({
        stage_id: (s as RoadmapStage).id,
        title: it.title,
        area_id: (areas ?? []).find((a) => a.name === it.area)?.id ?? null,
        position: j,
      }));
      const { error: e3 } = await supabase.from("roadmap_items").insert(items);
      if (e3) fail(e3);
    }
    await reload();
  }, [supabase, data.areas.length, data.stages.length, reload, fail]);

  const scoreConfig: ScoreConfig = data.settings?.score_config ?? DEFAULT_SCORE_CONFIG;
  const scoreIndex = useMemo(
    () => buildScoreIndex(data.goals, data.activities, data.dailyLogs),
    [data.goals, data.activities, data.dailyLogs],
  );
  const dayScore = useCallback((date: string) => scoreDay(date, scoreIndex, scoreConfig), [scoreIndex, scoreConfig]);

  // Record today's progress for every area so "progress over time" charts use real history.
  const lastSnapshot = useRef("");
  useEffect(() => {
    if (loading || !user || !data.areas.length) return;
    const date = today();
    const rows = data.areas
      .filter((a) => !a.archived)
      .map((a) => ({ user_id: user.id, area_id: a.id, date, progress: areaProgress(a, data.categories, data.goals).value }));
    const changed = rows.filter(
      (r) => data.snapshots.find((s) => s.area_id === r.area_id && s.date === date)?.progress !== r.progress,
    );
    const sig = JSON.stringify(changed);
    if (!changed.length || sig === lastSnapshot.current) return;
    lastSnapshot.current = sig;
    const t = setTimeout(async () => {
      const { data: saved, error } = await supabase
        .from("progress_snapshots")
        .upsert(changed, { onConflict: "user_id,area_id,date" })
        .select();
      if (error || !saved) return;
      setData((d) => ({
        ...d,
        snapshots: [
          ...d.snapshots.filter((s) => !(saved as ProgressSnapshot[]).some((n) => n.id === s.id || (n.area_id === s.area_id && n.date === s.date))),
          ...(saved as ProgressSnapshot[]),
        ],
      }));
    }, 800);
    return () => clearTimeout(t);
  }, [loading, user, data.areas, data.categories, data.goals, data.snapshots, supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // Full reload so no data from this session stays in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }, [supabase]);

  const value: Store = {
    user,
    data,
    loading,
    error,
    scoreConfig,
    reload,
    insert,
    update,
    remove,
    toggleGoal,
    saveLog,
    saveSettings,
    applyTemplate,
    dayScore,
    signOut,
    clearError: () => setError(null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
