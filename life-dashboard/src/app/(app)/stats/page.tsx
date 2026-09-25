"use client";

import { useMemo, useState } from "react";
import { Area as AreaMark, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "@/lib/store";
import { addDays, formatShort, monthKey, formatMonth, rangeDays, today, toISODate, weekStart } from "@/lib/dates";
import { areaProgress, overallProgress } from "@/lib/progress";
import { scoreBand } from "@/lib/score";
import { BAND_COLOR, Card, EmptyState, PageHeader, Segmented, SectionTitle } from "@/components/ui";

const AXIS = { stroke: "var(--color-line-strong)", tick: { fill: "var(--color-faint)", fontSize: 11 }, tickLine: false, axisLine: false } as const;

function ChartTooltip({ active, payload, label, fmt }: { active?: boolean; payload?: { value: number | null; name: string; color?: string }[]; label?: string; fmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface-3 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 text-muted">{fmt && label ? fmt(label) : label}</p>
      {payload.map((p) => (
        <p key={p.name} className="tabular font-medium">
          {p.name}: {p.value ?? "no activity"}
        </p>
      ))}
    </div>
  );
}

export default function StatsPage() {
  const { data, dayScore } = useStore();
  const t = today();
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const [completedBy, setCompletedBy] = useState<"week" | "month">("week");
  const areas = data.areas.filter((a) => !a.archived);
  const wso = data.settings?.week_starts_on ?? 1;

  // Progress over time: carry each area's last known snapshot forward day by day.
  const progressSeries = useMemo(() => {
    if (!data.snapshots.length) return [];
    const first = data.snapshots.reduce((m, s) => (s.date < m ? s.date : m), t);
    const byArea = new Map<string, Map<string, number>>();
    data.snapshots.forEach((s) => {
      if (!byArea.has(s.area_id)) byArea.set(s.area_id, new Map());
      byArea.get(s.area_id)!.set(s.date, s.progress);
    });
    const last = new Map<string, number>();
    return rangeDays(first < addDays(t, -365) ? addDays(t, -365) : first, t).map((d) => {
      const row: Record<string, number | string | null> = { date: d };
      let sum = 0;
      let n = 0;
      for (const a of areas) {
        const v = byArea.get(a.id)?.get(d);
        if (v !== undefined) last.set(a.id, v);
        const cur = d === t ? areaProgress(a, data.categories, data.goals).value : last.get(a.id);
        row[a.id] = cur ?? null;
        if (cur !== undefined) { sum += cur; n++; }
      }
      row.overall = d === t ? overallProgress(data.areas, data.categories, data.goals) : n ? Math.round(sum / n) : null;
      return row;
    });
  }, [data.snapshots, data.categories, data.goals, data.areas, areas, t]);

  const scoreSeries = useMemo(
    () => rangeDays(addDays(t, -(Number(range) - 1)), t).map((d) => ({ date: d, score: dayScore(d).score })),
    [range, t, dayScore],
  );
  const scored = scoreSeries.filter((d) => d.score !== null);
  const avgScore = scored.length ? Math.round(scored.reduce((a, d) => a + (d.score ?? 0), 0) / scored.length) : null;

  const completedSeries = useMemo(() => {
    const done = data.goals.filter((g) => g.completed_on);
    if (completedBy === "week") {
      const cur = weekStart(t, wso);
      return Array.from({ length: 12 }, (_, i) => addDays(cur, (i - 11) * 7)).map((w) => ({
        label: w,
        count: done.filter((g) => g.completed_on! >= w && g.completed_on! <= addDays(w, 6)).length,
      }));
    }
    const d = new Date();
    return Array.from({ length: 6 }, (_, i) => monthKey(toISODate(new Date(d.getFullYear(), d.getMonth() - 5 + i, 1))))
      .map((m) => ({ label: m, count: done.filter((g) => monthKey(g.completed_on!) === m).length }));
  }, [data.goals, completedBy, t, wso]);

  const effort = useMemo(() => {
    const from = addDays(t, -29);
    return areas
      .map((a) => {
        const acts = data.activities.filter((x) => x.area_id === a.id && x.date >= from && x.date <= t);
        return { name: `${a.icon} ${a.name}`, color: a.color, days: new Set(acts.map((x) => x.date)).size, minutes: acts.reduce((s, x) => s + (x.minutes ?? 0), 0) };
      })
      .sort((x, y) => y.days - x.days);
  }, [areas, data.activities, t]);

  if (!areas.length) return <EmptyState title="No data yet" text="Create areas and start logging to see statistics." />;

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title="Statistics" subtitle="Every chart answers one question." />

      <Card>
        <SectionTitle>Am I making progress overall?</SectionTitle>
        {progressSeries.length < 2 ? (
          <p className="text-sm text-muted">Progress is recorded once per day. Come back tomorrow to see the trend — today: {overallProgress(data.areas, data.categories, data.goals)}%.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={progressSeries} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="ov" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="date" {...AXIS} tickFormatter={formatShort} minTickGap={32} />
                <YAxis domain={[0, 100]} {...AXIS} width={40} />
                <Tooltip content={<ChartTooltip fmt={formatShort} />} cursor={{ stroke: "var(--color-line-strong)" }} />
                <AreaMark type="monotone" dataKey="overall" name="Overall %" stroke="var(--color-accent)" strokeWidth={2} fill="url(#ov)" connectNulls isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Which areas are moving?</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {areas.map((a) => {
            const cur = areaProgress(a, data.categories, data.goals).value;
            const firstVal = progressSeries.find((r) => r[a.id] !== null && r[a.id] !== undefined)?.[a.id] as number | undefined;
            const delta = firstVal !== undefined ? cur - firstVal : 0;
            return (
              <div key={a.id} className="rounded-xl border border-line bg-surface-2 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="truncate text-sm">{a.icon} {a.name}</span>
                  <span className="tabular text-sm font-semibold">{cur}% <span className={`text-xs font-normal ${delta > 0 ? "text-good" : delta < 0 ? "text-low" : "text-faint"}`}>{delta > 0 ? `+${delta}` : delta < 0 ? delta : "±0"}</span></span>
                </div>
                <div className="mt-2 h-14">
                  {progressSeries.length >= 2 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={progressSeries} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                        <YAxis domain={[0, 100]} hide />
                        <Tooltip content={<ChartTooltip fmt={formatShort} />} cursor={{ stroke: "var(--color-line-strong)" }} />
                        <Line type="monotone" dataKey={a.id} name={a.name} stroke={a.color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="pt-4 text-center text-[11px] text-faint">trend appears after 2 days</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle action={<Segmented value={range} onChange={setRange} options={[{ value: "7", label: "7d" }, { value: "30", label: "30d" }, { value: "90", label: "90d" }]} />}>
            How consistent am I?
          </SectionTitle>
          <p className="mb-3 text-sm text-muted">
            <span className="tabular text-2xl font-semibold text-fg">{scored.length}/{scoreSeries.length}</span> active days · average score{" "}
            <span className="tabular font-semibold text-fg">{avgScore ?? "—"}</span>
          </p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreSeries} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap={range === "90" ? 1 : 2}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="date" {...AXIS} tickFormatter={formatShort} minTickGap={24} />
                <YAxis domain={[0, 100]} {...AXIS} width={40} />
                <Tooltip content={<ChartTooltip fmt={formatShort} />} cursor={{ fill: "var(--color-surface-3)" }} />
                <Bar dataKey="score" name="Score" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {scoreSeries.map((d) => <Cell key={d.date} fill={BAND_COLOR[scoreBand(d.score)]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle action={<Segmented value={completedBy} onChange={setCompletedBy} options={[{ value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }]} />}>
            How much am I getting done?
          </SectionTitle>
          <p className="mb-3 text-sm text-muted">Completed tasks & goals per {completedBy}.</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={completedSeries} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="label" {...AXIS} tickFormatter={(l: string) => (completedBy === "week" ? formatShort(l) : formatMonth(l).split(" ")[0].slice(0, 3))} minTickGap={16} />
                <YAxis allowDecimals={false} {...AXIS} width={40} />
                <Tooltip content={<ChartTooltip fmt={(l) => (completedBy === "week" ? `Week of ${formatShort(l)}` : formatMonth(l))} />} cursor={{ fill: "var(--color-surface-3)" }} />
                <Bar dataKey="count" name="Completed" fill="var(--color-accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle>Where does my effort go? · last 30 days</SectionTitle>
        <ul className="space-y-2.5">
          {effort.map((e) => (
            <li key={e.name} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_auto]">
              <span className="truncate text-muted">{e.name}</span>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full" style={{ width: `${(e.days / 30) * 100}%`, background: e.color }} />
              </div>
              <span className="tabular w-28 text-right text-xs text-muted">{e.days} days{e.minutes ? ` · ${Math.round(e.minutes / 6) / 10} h` : ""}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
