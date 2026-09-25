"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { useStore } from "@/lib/store";
import { addDays, formatMonth, formatWeek, monthKey, parseISODate, today, weekStart } from "@/lib/dates";
import { weeklyProgress } from "@/lib/progress";
import { Card, EmptyState, PageHeader, ProgressBar, ScoreBadge, Segmented } from "@/components/ui";

type View = "day" | "week" | "month";

export default function HistoryPage() {
  return (
    <Suspense>
      <History />
    </Suspense>
  );
}

function History() {
  const params = useSearchParams();
  const router = useRouter();
  const view = (params.get("view") as View) || "day";
  const focus = params.get("focus");
  const { data, dayScore } = useStore();
  const t = today();
  const wso = data.settings?.week_starts_on ?? 1;
  const areaIcon = (id: string | null) => data.areas.find((a) => a.id === id)?.icon ?? "";

  // Every date that has anything recorded
  const days = useMemo(() => {
    const set = new Set<string>();
    data.activities.forEach((a) => set.add(a.date));
    data.dailyLogs.forEach((l) => set.add(l.date));
    data.goals.forEach((g) => g.kind === "task" && g.scheduled_for && g.scheduled_for <= t && set.add(g.scheduled_for));
    return [...set].filter((d) => d <= t).sort().reverse();
  }, [data.activities, data.dailyLogs, data.goals, t]);

  const weeks = useMemo(() => {
    const set = new Set(days.map((d) => weekStart(d, wso)));
    data.goals.forEach((g) => g.kind === "weekly" && g.week_start && g.week_start <= t && set.add(g.week_start));
    return [...set].sort().reverse();
  }, [days, data.goals, t, wso]);

  const months = [...new Set(days.map(monthKey))].sort().reverse();

  if (!days.length && !weeks.length) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="History" />
        <EmptyState title="No history yet" text="Every task you complete and every activity you log will appear here — day by day, week by week." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="History"
        subtitle="Small actions, adding up."
        action={<Segmented value={view} onChange={(v) => router.replace(`/history?view=${v}`)} options={[{ value: "day", label: "Days" }, { value: "week", label: "Weeks" }, { value: "month", label: "Months" }]} />}
      />

      {view === "day" && (
        <div className="space-y-6">
          {months.map((m) => (
            <section key={m}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{formatMonth(m)}</h2>
              <Card className="p-2 sm:p-3">
                <ul className="divide-y divide-line">
                  {days.filter((d) => monthKey(d) === m).map((d) => {
                    const s = dayScore(d);
                    const acts = data.activities.filter((a) => a.date === d);
                    const note = data.dailyLogs.find((l) => l.date === d)?.notes;
                    return (
                      <li key={d}>
                        <Link href={`/day/${d}`} className="flex items-center gap-4 rounded-xl px-2 py-3 hover:bg-surface-2">
                          <div className="w-12 shrink-0 text-center">
                            <p className="tabular text-lg font-semibold leading-none">{parseISODate(d).getDate()}</p>
                            <p className="text-[10px] uppercase text-faint">{parseISODate(d).toLocaleDateString("en-GB", { weekday: "short" })}</p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{acts.length ? acts.map((a) => `${areaIcon(a.area_id)} ${a.description}`).join(" · ") : <span className="text-faint">No actions recorded</span>}</p>
                            {note && <p className="mt-0.5 truncate text-xs italic text-muted">“{note}”</p>}
                          </div>
                          <ScoreBadge score={s.score} manual={s.manual} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}

      {view === "week" && (
        <div className="space-y-3">
          {weeks.map((w) => {
            const wp = weeklyProgress(data.goals, w);
            const weekGoals = data.goals.filter((g) => g.kind === "weekly" && g.week_start === w);
            const scores = Array.from({ length: 7 }, (_, i) => addDays(w, i)).filter((d) => d <= t).map((d) => dayScore(d).score).filter((x): x is number => x !== null);
            const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
            const completed = data.goals.filter((g) => g.completed_on && g.completed_on >= w && g.completed_on <= addDays(w, 6)).length;
            return (
              <Card key={w} className={focus === w ? "ring-2 ring-accent" : ""}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold">{formatWeek(w)} {w === weekStart(t, wso) && <span className="ml-1 text-xs font-normal text-accent">this week</span>}</h2>
                  <p className="tabular text-xs text-muted">{scores.length} active days · avg score {avg ?? "—"} · {completed} completed</p>
                </div>
                {weekGoals.length > 0 && (
                  <>
                    <div className="mt-3 flex items-center gap-3">
                      <ProgressBar value={wp.percent} className="flex-1" label="Weekly goals" />
                      <span className="tabular text-sm font-medium">{wp.done}/{wp.total}</span>
                    </div>
                    <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                      {weekGoals.map((g) => (
                        <li key={g.id} className="flex items-start gap-2 text-sm">
                          <span className={g.completed ? "text-good" : "text-faint"} aria-label={g.completed ? "done" : "not done"}>{g.completed ? "☑" : "☐"}</span>
                          <span className={g.completed ? "" : "text-muted"}>{areaIcon(g.area_id)} {g.title}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {view === "month" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {months.map((m) => {
            const md = days.filter((d) => monthKey(d) === m);
            const scores = md.map((d) => dayScore(d).score).filter((x): x is number => x !== null);
            const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
            const completed = data.goals.filter((g) => g.completed_on && monthKey(g.completed_on) === m).length;
            const minutes = data.activities.filter((a) => monthKey(a.date) === m).reduce((s, a) => s + (a.minutes ?? 0), 0);
            const perArea = data.areas
              .map((a) => ({ a, n: data.activities.filter((x) => x.area_id === a.id && monthKey(x.date) === m).length }))
              .filter((x) => x.n > 0)
              .sort((x, y) => y.n - x.n);
            const maxN = Math.max(1, ...perArea.map((x) => x.n));
            return (
              <Card key={m}>
                <h2 className="text-base font-semibold">{formatMonth(m)}</h2>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-surface-2 py-2"><p className="tabular text-lg font-semibold">{scores.length}</p><p className="text-[10px] text-muted">active days</p></div>
                  <div className="rounded-xl bg-surface-2 py-2"><p className="tabular text-lg font-semibold">{avg ?? "—"}</p><p className="text-[10px] text-muted">avg score</p></div>
                  <div className="rounded-xl bg-surface-2 py-2"><p className="tabular text-lg font-semibold">{completed}</p><p className="text-[10px] text-muted">completed</p></div>
                </div>
                {perArea.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {perArea.map(({ a, n }) => (
                      <li key={a.id} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-2 text-xs">
                        <span className="truncate text-muted">{a.icon} {a.name}</span>
                        <ProgressBar value={(n / maxN) * 100} color={a.color} size="sm" />
                        <span className="tabular text-right text-muted">{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {minutes > 0 && <p className="mt-3 text-xs text-faint">{Math.round(minutes / 6) / 10} hours logged</p>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
