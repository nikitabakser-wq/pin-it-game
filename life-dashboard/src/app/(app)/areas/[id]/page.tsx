"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Pencil, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { addDays, deadlineLabel, formatDeadline, formatShort, formatWeek, today, weekStart } from "@/lib/dates";
import { areaProgress, categoryProgress, weeklyProgress } from "@/lib/progress";
import { useEditors } from "@/components/editors";
import { GoalList } from "@/components/goal-item";
import { Button, Card, EmptyState, ProgressBar, Ring, SectionTitle } from "@/components/ui";

const MODE_LABEL = { manual: "Manual", tasks: "From goals", mixed: "Combined" } as const;

export default function AreaPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useStore();
  const { editArea, editCategory, editGoal, editActivity } = useEditors();
  const area = data.areas.find((a) => a.id === id);

  if (!area) {
    return <EmptyState title="Area not found" text="It may have been deleted." action={<Link href="/" className="text-sm text-accent">Back to dashboard</Link>} />;
  }

  const date = today();
  const ws = weekStart(date, data.settings?.week_starts_on ?? 1);
  const p = areaProgress(area, data.categories, data.goals);
  const cats = data.categories.filter((c) => c.area_id === area.id);
  const goals = data.goals.filter((g) => g.area_id === area.id);
  const milestones = goals.filter((g) => g.kind === "goal");
  const weekly = goals.filter((g) => g.kind === "weekly" && g.week_start === ws);
  const wp = weeklyProgress(data.goals, ws, area.id);
  const tasks = goals.filter((g) => g.kind === "task" && ((g.scheduled_for ?? "") >= date || !g.completed));
  const acts = data.activities.filter((a) => a.area_id === area.id).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  const minutes30 = acts.filter((a) => a.date > addDays(date, -30)).reduce((s, a) => s + (a.minutes ?? 0), 0);
  const days30 = new Set(acts.filter((a) => a.date > addDays(date, -30)).map((a) => a.date)).size;

  // Weekly history for this area (previous weeks kept, never overwritten)
  const pastWeeks = [...new Set(goals.filter((g) => g.kind === "weekly" && g.week_start && g.week_start < ws).map((g) => g.week_start!))].sort().reverse().slice(0, 6);

  return (
    <div className="animate-fade-in space-y-5">
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ChevronLeft size={14} /> Dashboard
      </Link>

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-20 -left-10 size-56 rounded-full opacity-20 blur-3xl" style={{ background: area.color }} aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <Ring value={p.value} size={120} stroke={10} color={area.color}>
            <span className="tabular text-3xl font-semibold">{p.value}%</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                <span className="mr-2">{area.icon}</span>{area.name.toUpperCase()}
              </h1>
              <Button size="sm" onClick={() => editArea(area)}><Pencil size={13} /> Edit</Button>
            </div>
            {area.description && <p className="mt-1 text-sm text-muted">{area.description}</p>}
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <div className="col-span-2">
                <dt className="text-[11px] uppercase tracking-wider text-faint">Main goal</dt>
                <dd className="mt-0.5 font-medium">{area.main_goal ?? <span className="text-faint">Not set</span>}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-faint">Deadline</dt>
                <dd className="mt-0.5 font-medium">
                  {area.deadline ? <>{formatDeadline(area.deadline)} <span className="block text-xs font-normal text-muted">{deadlineLabel(area.deadline)}</span></> : <span className="text-faint">—</span>}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-faint">Last 30 days</dt>
                <dd className="mt-0.5 font-medium tabular">{days30} active days{minutes30 ? <span className="block text-xs font-normal text-muted">{Math.round(minutes30 / 6) / 10} h logged</span> : null}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-faint">Progress: {MODE_LABEL[area.progress_mode]} — {p.source}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => editCategory({ area_id: area.id })}><Plus size={14} /> Category</Button>}>
            Categories
          </SectionTitle>
          {cats.length === 0 ? (
            <p className="text-sm text-muted">No categories. Add some (e.g. Speaking, Grammar) to track progress in detail.</p>
          ) : (
            <ul className="-mx-2 space-y-1">
              {cats.map((c) => {
                const cp = categoryProgress(c, data.goals);
                return (
                  <li key={c.id}>
                    <button onClick={() => editCategory(c)} className="w-full rounded-xl px-2 py-2.5 text-left transition hover:bg-surface-2" aria-label={`Edit ${c.name}, ${cp.value}%`}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium">{c.name}</span>
                        <span className="tabular text-sm font-semibold">{cp.value}%</span>
                      </div>
                      <ProgressBar value={cp.value} color={area.color} size="sm" />
                      <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-faint">
                        {c.progress_mode !== "manual" && <span>{cp.source}</span>}
                        {c.target && <span>🎯 {c.target}</span>}
                        {c.deadline && <span>· {deadlineLabel(c.deadline)}</span>}
                        {c.notes && <span className="truncate">· {c.notes}</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => editGoal({ kind: "weekly", area_id: area.id })}><Plus size={14} /> Weekly</Button>}>
            This week · {formatWeek(ws)}
          </SectionTitle>
          <div className="mb-3 flex items-center gap-3">
            <span className="tabular text-2xl font-semibold">{wp.done} / {wp.total}</span>
            <ProgressBar value={wp.percent} color={area.color} className="flex-1" label="Weekly progress" />
          </div>
          <GoalList goals={weekly} showArea={false} empty={<p className="text-sm text-muted">No weekly goals yet.</p>} />
          {pastWeeks.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-faint">Previous weeks</p>
              <ul className="space-y-1.5">
                {pastWeeks.map((w) => {
                  const x = weeklyProgress(data.goals, w, area.id);
                  return (
                    <li key={w}>
                      <Link href={`/history?view=week&focus=${w}`} className="flex items-center gap-3 text-xs text-muted hover:text-fg">
                        <span className="w-28 shrink-0">{formatWeek(w)}</span>
                        <ProgressBar value={x.percent} color={area.color} size="sm" className="flex-1" />
                        <span className="tabular w-10 text-right">{x.done}/{x.total}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => editGoal({ kind: "goal", area_id: area.id })}><Plus size={14} /> Goal</Button>}>
            Goals · {milestones.filter((g) => g.completed).length}/{milestones.length}
          </SectionTitle>
          <GoalList goals={milestones} showArea={false} empty={<p className="text-sm text-muted">No goals yet. Milestones with deadlines keep you honest.</p>} />
        </Card>

        <Card>
          <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => editGoal({ kind: "task", area_id: area.id, scheduled_for: date })}><Plus size={14} /> Task</Button>}>
            Upcoming tasks
          </SectionTitle>
          <GoalList goals={tasks} showArea={false} empty={<p className="text-sm text-muted">No upcoming tasks.</p>} />
        </Card>
      </div>

      <Card>
        <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => editActivity({ area_id: area.id, date })}><Plus size={14} /> Log</Button>}>
          Activity log
        </SectionTitle>
        {acts.length === 0 ? (
          <p className="text-sm text-muted">No activity recorded in this area yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {acts.slice(0, 15).map((a) => (
              <li key={a.id}>
                <button onClick={() => editActivity(a)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:text-fg">
                  <span className="w-16 shrink-0 text-xs text-muted">{formatShort(a.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{a.goal_id ? "☑ " : ""}{a.description}</span>
                  {a.minutes ? <span className="tabular text-xs text-muted">{a.minutes} min</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
