import { addDays, diffDays, weekStart } from "./dates";
import { areaProgress, categoryProgress, weeklyProgress } from "./progress";
import type { AppData, Goal } from "./types";

// Rule-based "Today's Focus". Works offline, no external API.
// Each rule produces candidates with a priority; the top few are shown.

export interface FocusItem {
  id: string;
  kind: "overdue" | "today" | "deadline" | "weakest" | "neglected" | "weekly" | "plan";
  title: string;
  reason: string;
  action: string;
  areaId?: string;
  goalId?: string;
  priority: number;
}

const PRIORITY_BONUS = { high: 15, medium: 5, low: 0 } as const;

export function buildFocus(data: AppData, date: string, limit = 3): FocusItem[] {
  const areas = data.areas.filter((a) => !a.archived);
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const label = (g: Goal) => {
    const a = g.area_id ? areaById.get(g.area_id) : undefined;
    return a ? `${a.icon} ${a.name}` : "General";
  };
  const open = data.goals.filter((g) => !g.completed && (!g.area_id || areaById.has(g.area_id)));
  const items: FocusItem[] = [];

  // 1. Overdue goals / tasks
  for (const g of open) {
    const due = g.kind === "task" ? g.scheduled_for : g.deadline;
    if (!due || due >= date) continue;
    const late = diffDays(date, due);
    items.push({
      id: `overdue-${g.id}`,
      kind: "overdue",
      title: `Overdue: ${g.title}`,
      reason: `${label(g)} — ${late} day${late === 1 ? "" : "s"} past its ${g.kind === "task" ? "planned day" : "deadline"}.`,
      action: "Finish it today, or move the date so your plan stays honest.",
      areaId: g.area_id ?? undefined,
      goalId: g.id,
      priority: 90 + Math.min(late, 10) + PRIORITY_BONUS[g.priority],
    });
  }

  // 2. Today's unfinished tasks (important first)
  const todays = open.filter((g) => g.kind === "task" && g.scheduled_for === date);
  for (const g of todays) {
    items.push({
      id: `today-${g.id}`,
      kind: "today",
      title: g.title,
      reason: `${label(g)} — planned for today${g.priority === "high" ? ", marked high priority" : ""}.`,
      action: "Do this first while your energy is highest.",
      areaId: g.area_id ?? undefined,
      goalId: g.id,
      priority: 60 + PRIORITY_BONUS[g.priority] * 2,
    });
  }

  // 3. Approaching deadlines (within 7 days)
  for (const g of open) {
    if (g.kind === "task" || !g.deadline || g.deadline < date) continue;
    const left = diffDays(g.deadline, date);
    if (left > 7) continue;
    items.push({
      id: `deadline-${g.id}`,
      kind: "deadline",
      title: g.title,
      reason: `${label(g)} — deadline ${left === 0 ? "is today" : `in ${left} day${left === 1 ? "" : "s"}`}.`,
      action: "Block time today to move it forward.",
      areaId: g.area_id ?? undefined,
      goalId: g.id,
      priority: 70 - left * 3 + PRIORITY_BONUS[g.priority],
    });
  }

  // 4. Weekly goals behind pace
  const ws = weekStart(date, data.settings?.week_starts_on ?? 1);
  const dayOfWeek = diffDays(date, ws); // 0..6
  const daysLeft = 6 - dayOfWeek;
  for (const a of areas) {
    const wp = weeklyProgress(data.goals, ws, a.id);
    if (!wp.total) continue;
    const remaining = wp.total - wp.done;
    const expected = (dayOfWeek + 1) / 7;
    if (remaining > 0 && wp.done / wp.total < expected - 0.2) {
      const next = data.goals.find((g) => g.kind === "weekly" && g.week_start === ws && g.area_id === a.id && !g.completed);
      items.push({
        id: `weekly-${a.id}`,
        kind: "weekly",
        title: `${a.icon} ${a.name}: ${remaining} weekly goal${remaining === 1 ? "" : "s"} left`,
        reason: `${wp.done}/${wp.total} done and ${daysLeft === 0 ? "the week ends today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left this week`}.`,
        action: next ? `Next up: ${next.title}.` : "Pick one weekly goal and finish it today.",
        areaId: a.id,
        goalId: next?.id,
        priority: 55 + remaining * 4 + (daysLeft <= 2 ? 10 : 0),
      });
    }
  }

  // 5. Weakest category inside an area
  for (const a of areas) {
    const cats = data.categories.filter((c) => c.area_id === a.id);
    if (cats.length < 2) continue;
    const scored = cats.map((c) => ({ c, v: categoryProgress(c, data.goals).value }));
    scored.sort((x, y) => x.v - y.v);
    const low = scored[0];
    const avgOthers = scored.slice(1).reduce((s, x) => s + x.v, 0) / (scored.length - 1);
    const gap = avgOthers - low.v;
    if (gap < 15) continue;
    items.push({
      id: `weakest-${low.c.id}`,
      kind: "weakest",
      title: `${a.icon} ${low.c.name} is falling behind`,
      reason: `${low.c.name} is at ${low.v}% while your other ${a.name} categories average ${Math.round(avgOthers)}%.`,
      action: `Spend 20–30 focused minutes on ${low.c.name} today.`,
      areaId: a.id,
      priority: 40 + Math.min(gap, 40) / 2,
    });
  }

  // 6. Neglected areas (no activity for 5+ days)
  for (const a of areas) {
    const last = data.activities
      .filter((x) => x.area_id === a.id && x.date <= date)
      .reduce<string | null>((m, x) => (!m || x.date > m ? x.date : m), null);
    const since = last ? diffDays(date, last) : null;
    const created = a.created_at.slice(0, 10);
    if (since === null && diffDays(date, created) < 5) continue;
    if (since !== null && since < 5) continue;
    items.push({
      id: `neglected-${a.id}`,
      kind: "neglected",
      title: `${a.icon} ${a.name} needs attention`,
      reason: since === null ? "No activity recorded in this area yet." : `No activity recorded for ${since} days.`,
      action: `Do one small action for ${a.name} today — even 15 minutes keeps momentum.`,
      areaId: a.id,
      priority: 35 + Math.min(since ?? 10, 20) + (100 - areaProgress(a, data.categories, data.goals).value) / 10,
    });
  }

  // 7. Nothing planned for today
  const plannedToday = data.goals.filter((g) => g.kind === "task" && g.scheduled_for === date);
  if (!plannedToday.length && areas.length) {
    items.push({
      id: "plan-today",
      kind: "plan",
      title: "Plan your day",
      reason: "No tasks are planned for today yet, so the daily score has nothing to measure against.",
      action: "Add 2–4 tasks for today — at least one high priority.",
      priority: 45,
    });
  }

  // One recommendation per goal, one per area for area-level rules, highest priority first.
  items.sort((x, y) => y.priority - x.priority);
  const seenGoals = new Set<string>();
  const seenAreaRules = new Set<string>();
  const out: FocusItem[] = [];
  for (const it of items) {
    if (it.goalId && seenGoals.has(it.goalId)) continue;
    if (!it.goalId && it.areaId) {
      const k = `${it.kind}-${it.areaId}`;
      if (seenAreaRules.has(k)) continue;
      seenAreaRules.add(k);
    }
    if (it.goalId) seenGoals.add(it.goalId);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

/** Compact snapshot of the user's situation, used for the optional AI coach. */
export function summarizeForAI(data: AppData, date: string) {
  const ws = weekStart(date, data.settings?.week_starts_on ?? 1);
  const areas = data.areas.filter((a) => !a.archived);
  return {
    date,
    areas: areas.map((a) => ({
      name: a.name,
      progress: areaProgress(a, data.categories, data.goals).value,
      mainGoal: a.main_goal,
      deadline: a.deadline,
      categories: data.categories
        .filter((c) => c.area_id === a.id)
        .map((c) => ({ name: c.name, progress: categoryProgress(c, data.goals).value })),
      weekly: weeklyProgress(data.goals, ws, a.id),
      lastActivity:
        data.activities
          .filter((x) => x.area_id === a.id)
          .map((x) => x.date)
          .sort()
          .pop() ?? null,
    })),
    openGoals: data.goals
      .filter((g) => !g.completed && (g.kind !== "weekly" || g.week_start === ws))
      .filter((g) => g.kind !== "task" || (g.scheduled_for ?? "") >= addDays(date, -7))
      .slice(0, 40)
      .map((g) => ({
        title: g.title,
        kind: g.kind,
        area: areas.find((a) => a.id === g.area_id)?.name ?? null,
        priority: g.priority,
        due: g.kind === "task" ? g.scheduled_for : g.deadline,
      })),
    rules: buildFocus(data, date, 5).map((f) => `${f.title} — ${f.reason}`),
  };
}
