"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { addDays, deadlineLabel, formatLong, formatShort, today, weekStart } from "@/lib/dates";
import { areaProgress, overallProgress, weeklyProgress } from "@/lib/progress";
import { useEditors } from "@/components/editors";
import { FocusCard } from "@/components/focus-card";
import { GoalList } from "@/components/goal-item";
import { ScoreStrip } from "@/components/score-spark";
import { WeeklyReviewBanner } from "@/components/weekly-review";
import { Button, Card, EmptyState, ProgressBar, Ring, ScoreBadge, SectionTitle } from "@/components/ui";

export default function Dashboard() {
  const { data, dayScore, applyTemplate } = useStore();
  const { editArea, editGoal, editActivity } = useEditors();
  const [seeding, setSeeding] = useState(false);
  const date = today();
  const ws = weekStart(date, data.settings?.week_starts_on ?? 1);
  const areas = data.areas.filter((a) => !a.archived);
  const overall = overallProgress(data.areas, data.categories, data.goals);
  const todayScore = dayScore(date);
  const week = weeklyProgress(data.goals, ws);

  const todays = data.goals.filter(
    (g) => g.kind === "task" && (g.scheduled_for === date || (!g.completed && (g.scheduled_for ?? "") < date)),
  );
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(date, i - 13)).map((d) => ({ date: d, score: dayScore(d).score }));
  const recent = [...new Set(data.activities.map((a) => a.date))]
    .filter((d) => d <= date)
    .sort()
    .reverse()
    .slice(0, 4)
    .map((d) => ({ date: d, acts: data.activities.filter((a) => a.date === d), score: dayScore(d) }));

  const scored = last14.filter((d) => d.score !== null);
  const avg7 = (() => {
    const s = last14.slice(-7).filter((d) => d.score !== null);
    return s.length ? Math.round(s.reduce((a, b) => a + (b.score ?? 0), 0) / s.length) : null;
  })();
  const activeDays7 = last14.slice(-7).filter((d) => d.score !== null).length;
  const doneThisWeek = data.goals.filter((g) => g.completed && g.completed_on && g.completed_on >= ws).length;

  if (!areas.length) {
    return (
      <div className="animate-fade-in">
        <Header date={date} />
        <Card className="mt-6">
          <EmptyState
            title="Set up your areas"
            text="Areas are the parts of your life you want to grow. Start with the suggested five (English, Gym, Renovation, Content, Other Projects) — everything stays editable — or create your own."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" disabled={seeding} onClick={async () => { setSeeding(true); try { await applyTemplate(); } finally { setSeeding(false); } }}>
                  {seeding ? "Creating…" : "Use the 5 suggested areas"}
                </Button>
                <Button onClick={() => editArea({})}><Plus size={16} /> Create my own</Button>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-5">
      {/* 1–2. Date + overall progress */}
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <Header date={date} />
        <Card className="flex items-center gap-5 lg:min-w-[22rem]">
          <Ring value={overall} size={96} stroke={9}>
            <span className="tabular text-2xl font-semibold">{overall}%</span>
          </Ring>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Overall progress</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Today</span>
              <Link href={`/day/${date}`}><ScoreBadge score={todayScore.score} manual={todayScore.manual} /></Link>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">This week</span>
              <span className="tabular font-medium">{week.done} / {week.total}</span>
            </div>
          </div>
        </Card>
      </div>

      <WeeklyReviewBanner />

      {/* 3. Areas */}
      <section aria-label="Areas">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {areas.map((a, i) => {
            const p = areaProgress(a, data.categories, data.goals);
            return (
              <Link
                key={a.id}
                href={`/areas/${a.id}`}
                className="group animate-fade-in rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-2"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl" aria-hidden>{a.icon}</span>
                  <ArrowRight size={14} className="text-faint transition group-hover:translate-x-0.5 group-hover:text-fg" />
                </div>
                <p className="mt-3 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{a.name}</p>
                <p className="tabular mt-0.5 text-3xl font-semibold tracking-tight" title={p.source}>{p.value}%</p>
                <ProgressBar value={p.value} color={a.color} size="sm" className="mt-2" label={`${a.name} progress`} />
                {a.main_goal && <p className="mt-3 line-clamp-2 text-xs text-fg/80">{a.main_goal}</p>}
                {a.deadline && <p className="mt-1 text-[11px] text-faint">{deadlineLabel(a.deadline)}</p>}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-5">
          {/* 4. Today's focus */}
          <FocusCard />

          {/* 5. Today's tasks */}
          <Card>
            <SectionTitle
              action={
                <Button size="sm" variant="ghost" onClick={() => editGoal({ kind: "task", scheduled_for: date })}>
                  <Plus size={14} /> Task
                </Button>
              }
            >
              Today&apos;s tasks
            </SectionTitle>
            <GoalList
              goals={todays}
              empty={<p className="text-sm text-muted">No tasks planned for today. Add 2–4 so your daily score reflects your plan.</p>}
            />
            <div className="mt-3 flex justify-between border-t border-line pt-3">
              <Button size="sm" variant="ghost" onClick={() => editActivity({ date })}>
                <Plus size={14} /> Log something else you did
              </Button>
              <Link href={`/day/${date}`} className="self-center text-xs text-muted hover:text-fg">Open today →</Link>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {/* 6. Weekly progress */}
          <Card>
            <SectionTitle action={<Link href="/goals?tab=weekly" className="text-xs text-muted hover:text-fg">All weekly →</Link>}>
              This week · {formatShort(ws)} – {formatShort(addDays(ws, 6))}
            </SectionTitle>
            <div className="mb-4 flex items-baseline gap-2">
              <span className="tabular text-3xl font-semibold">{week.done} / {week.total}</span>
              <span className="text-sm text-muted">weekly goals · {week.percent}%</span>
            </div>
            <ProgressBar value={week.percent} size="md" label="Weekly progress" />
            <ul className="mt-4 space-y-2.5">
              {areas.map((a) => {
                const w = weeklyProgress(data.goals, ws, a.id);
                if (!w.total) return null;
                return (
                  <li key={a.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
                    <span className="truncate text-muted">{a.icon} {a.name}</span>
                    <span className="tabular text-xs text-muted">{w.done}/{w.total}</span>
                    <ProgressBar value={w.percent} color={a.color} size="sm" className="col-span-2" label={`${a.name} weekly progress`} />
                  </li>
                );
              })}
            </ul>
            {!week.total && (
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => editGoal({ kind: "weekly" })}>
                <Plus size={14} /> Add a weekly goal
              </Button>
            )}
          </Card>

          {/* 8. Short statistics */}
          <Card>
            <SectionTitle action={<Link href="/stats" className="text-xs text-muted hover:text-fg">Statistics →</Link>}>
              Last 14 days
            </SectionTitle>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <Stat label="Avg score (7d)" value={avg7 === null ? "—" : String(avg7)} />
              <Stat label="Active days (7d)" value={`${activeDays7}/7`} />
              <Stat label="Done this week" value={String(doneThisWeek)} />
            </div>
            {scored.length ? <ScoreStrip days={last14} /> : <p className="text-xs text-muted">Scores appear here once you log activity.</p>}
          </Card>

          {/* 7. Recent activity */}
          <Card>
            <SectionTitle action={<Link href="/history" className="text-xs text-muted hover:text-fg">History →</Link>}>Recent activity</SectionTitle>
            {recent.length === 0 ? (
              <p className="text-sm text-muted">Nothing logged yet. Complete a task or log an activity.</p>
            ) : (
              <ul className="space-y-3">
                {recent.map((r) => (
                  <li key={r.date}>
                    <Link href={`/day/${r.date}`} className="-m-2 block rounded-xl p-2 hover:bg-surface-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{r.date === date ? "Today" : formatShort(r.date)}</span>
                        <ScoreBadge score={r.score.score} manual={r.score.manual} />
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                        {r.acts.map((a) => {
                          const area = data.areas.find((x) => x.id === a.area_id);
                          return `${area ? area.icon + " " : ""}${a.description}`;
                        }).join(" · ")}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Header({ date }: { date: string }) {
  return (
    <header>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">Life progress</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-4xl">{formatLong(date)}</h1>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="tabular text-xl font-semibold">{value}</p>
      <p className="text-[10px] leading-tight text-muted">{label}</p>
    </div>
  );
}
