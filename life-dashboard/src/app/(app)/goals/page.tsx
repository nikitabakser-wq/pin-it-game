"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useStore } from "@/lib/store";
import { addDays, formatWeek, today, weekStart } from "@/lib/dates";
import { weeklyProgress } from "@/lib/progress";
import type { GoalKind } from "@/lib/types";
import { useEditors } from "@/components/editors";
import { GoalList } from "@/components/goal-item";
import { Button, Card, PageHeader, ProgressBar, Segmented, Select } from "@/components/ui";

export default function GoalsPage() {
  return (
    <Suspense>
      <Goals />
    </Suspense>
  );
}

function Goals() {
  const params = useSearchParams();
  const router = useRouter();
  const { data, insert } = useStore();
  const { editGoal } = useEditors();
  const tab = (params.get("tab") as GoalKind) || "task";
  const [areaId, setAreaId] = useState("");
  const [status, setStatus] = useState<"open" | "done" | "all">("open");
  const date = today();
  const wso = data.settings?.week_starts_on ?? 1;
  const [week, setWeek] = useState(weekStart(date, wso));
  const [copying, setCopying] = useState(false);

  const setTab = (t: GoalKind) => router.replace(`/goals?tab=${t}`);
  let list = data.goals.filter((g) => g.kind === tab && (!areaId || g.area_id === areaId));
  if (tab === "weekly") list = list.filter((g) => g.week_start === week);
  else if (status !== "all") list = list.filter((g) => (status === "done" ? g.completed : !g.completed));

  const wp = weeklyProgress(data.goals.filter((g) => !areaId || g.area_id === areaId), week);
  const prevWeek = addDays(week, -7);
  const unfinishedPrev = data.goals.filter((g) => g.kind === "weekly" && g.week_start === prevWeek && !g.completed && (!areaId || g.area_id === areaId));

  const carryOver = async () => {
    setCopying(true);
    try {
      for (const g of unfinishedPrev) {
        await insert("goals", {
          kind: "weekly", title: g.title, area_id: g.area_id, category_id: g.category_id,
          priority: g.priority, notes: g.notes, deadline: g.deadline, week_start: week,
        });
      }
    } finally {
      setCopying(false);
    }
  };

  // Group tasks by day for readability
  const groups: { label: string; items: typeof list }[] = [];
  if (tab === "task") {
    const sorted = [...list].sort((a, b) => (a.scheduled_for ?? "").localeCompare(b.scheduled_for ?? ""));
    const overdue = sorted.filter((g) => !g.completed && (g.scheduled_for ?? "") < date);
    const byDay = new Map<string, typeof list>();
    for (const g of sorted) {
      if (overdue.includes(g)) continue;
      const k = g.scheduled_for ?? "";
      byDay.set(k, [...(byDay.get(k) ?? []), g]);
    }
    if (overdue.length) groups.push({ label: "Overdue", items: overdue });
    const keys = [...byDay.keys()].sort((a, b) => (status === "done" ? b.localeCompare(a) : a.localeCompare(b)));
    for (const k of keys) {
      const label = k === date ? "Today" : k === addDays(date, 1) ? "Tomorrow" : k === addDays(date, -1) ? "Yesterday" : new Date(k).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      groups.push({ label, items: byDay.get(k)! });
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Goals & tasks"
        subtitle="Set goal → work → record → see progress."
        action={
          <Button variant="primary" onClick={() => editGoal({ kind: tab, area_id: areaId || undefined, week_start: tab === "weekly" ? week : undefined, scheduled_for: tab === "task" ? date : undefined })}>
            <Plus size={16} /> New {tab === "task" ? "task" : tab === "weekly" ? "weekly goal" : "goal"}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={tab} onChange={setTab} options={[{ value: "task", label: "Tasks" }, { value: "weekly", label: "Weekly" }, { value: "goal", label: "Goals" }]} />
        <Select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="!h-9 w-auto min-w-40" aria-label="Filter by area">
          <option value="">All areas</option>
          {data.areas.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
        </Select>
        {tab !== "weekly" && (
          <Segmented value={status} onChange={setStatus} options={[{ value: "open", label: "Open" }, { value: "done", label: "Done" }, { value: "all", label: "All" }]} />
        )}
      </div>

      {tab === "weekly" && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="ghost" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><ChevronLeft size={16} /></Button>
            <span className="text-sm font-medium">{formatWeek(week)}{week === weekStart(date, wso) && <span className="ml-2 text-xs text-accent">this week</span>}</span>
            <Button size="sm" variant="ghost" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><ChevronRight size={16} /></Button>
            <span className="tabular ml-auto text-sm text-muted">{wp.done} / {wp.total} · {wp.percent}%</span>
          </div>
          <ProgressBar value={wp.percent} className="mt-3" label="Weekly progress" />
          {unfinishedPrev.length > 0 && (
            <Button size="sm" className="mt-3" disabled={copying} onClick={carryOver}>
              {copying ? "Copying…" : `Carry over ${unfinishedPrev.length} unfinished from last week`}
            </Button>
          )}
        </Card>
      )}

      <Card>
        {tab === "task" ? (
          groups.length ? (
            <div className="space-y-5">
              {groups.map((g) => (
                <div key={g.label}>
                  <p className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${g.label === "Overdue" ? "text-low" : "text-faint"}`}>{g.label}</p>
                  <GoalList goals={g.items} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No tasks here.</p>
          )
        ) : (
          <GoalList goals={list} empty={<p className="text-sm text-muted">Nothing here yet.</p>} />
        )}
      </Card>
    </div>
  );
}
