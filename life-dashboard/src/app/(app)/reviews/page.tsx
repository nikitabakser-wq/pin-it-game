"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "@/lib/store";
import { addDays, today, weekStart } from "@/lib/dates";
import { scoreBand } from "@/lib/score";
import { computeWeekStats, daysWord, formatWeekRangeUk, PRODUCTIVE_SCORE, REVIEW_READY_HOUR } from "@/lib/weekly";
import { DeltaPill, NotificationToggle } from "@/components/weekly-review";
import { BAND_COLOR, Card, EmptyState, PageHeader, ScoreBadge, SectionTitle } from "@/components/ui";

const AXIS = { tick: { fill: "var(--color-faint)", fontSize: 11 }, tickLine: false, axisLine: false } as const;

export default function ReviewsPage() {
  const { data, dayScore, weeklyReviewsReady } = useStore();
  const wso = data.settings?.week_starts_on ?? 1;
  const current = weekStart(today(), wso);
  const reviews = [...data.weeklyReviews].sort((a, b) => b.week_start.localeCompare(a.week_start));
  const chart = [...reviews].reverse().slice(-12).map((r) => ({ week: r.week_start, label: `Т${r.stats.weekNumber}`, score: r.score }));
  const live = computeWeekStats(data, current, dayScore);
  const lastWeek = weeklyReviewsReady ? null : computeWeekStats(data, addDays(current, -7), dayScore);

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title="🏆 Weekly Review"
        subtitle="Що ти реально робив за тиждень — і куди рухатись далі."
        action={<NotificationToggle />}
      />

      {!weeklyReviewsReady && (
        <Card className="border-mid/30 bg-mid/5">
          <p className="text-sm font-medium text-mid">Потрібне одне оновлення бази даних</p>
          <p className="mt-1 text-sm text-muted">
            Щоб підсумки зберігались і була історія тижнів, виконай у Supabase → SQL Editor файл{" "}
            <code className="text-fg">supabase/migrations/0002_weekly_reviews.sql</code>. До того огляд рахується «наживо» і не зберігається.
          </p>
          {lastWeek && lastWeek.score !== null && (
            <Link href={`/reviews/${lastWeek.weekStart}`} className="mt-3 inline-block text-sm text-accent hover:underline">
              Переглянути минулий тиждень ({lastWeek.score}/100) →
            </Link>
          )}
        </Card>
      )}

      {/* Current week (still running) */}
      <Card>
        <SectionTitle>Поточний тиждень · {formatWeekRangeUk(current)}</SectionTitle>
        {live.score === null ? (
          <p className="text-sm text-muted">Поки немає оцінок днів цього тижня.</p>
        ) : (
          <Link href={`/reviews/${current}`} className="-m-2 flex items-center justify-between gap-4 rounded-xl p-2 hover:bg-surface-2">
            <div>
              <p className="tabular text-2xl font-semibold">{live.score}<span className="text-sm font-normal text-muted">/100 поки що</span></p>
              <p className="text-xs text-muted">
                {daysWord(live.scoredDays)} з оцінкою · {live.productiveDays} продуктивних ({PRODUCTIVE_SCORE}+)
              </p>
            </div>
            <DeltaPill delta={live.delta} />
          </Link>
        )}
        <p className="mt-3 text-[11px] text-faint">
          Повний підсумок зʼявиться в останній день тижня після {REVIEW_READY_HOUR}:00 і оновиться, коли тиждень завершиться.
        </p>
      </Card>

      {weeklyReviewsReady && reviews.length === 0 && (
        <EmptyState title="Ще немає завершених тижнів" text="Перший Weekly Review зʼявиться автоматично, щойно завершиться тиждень, у якому є записи." />
      )}

      {chart.length >= 2 && (
        <Card>
          <SectionTitle>Оцінка по тижнях</SectionTitle>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 18, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis domain={[0, 100]} {...AXIS} width={36} />
                <Tooltip
                  cursor={{ fill: "var(--color-surface-3)" }}
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <div className="rounded-lg border border-line bg-surface-3 px-3 py-2 text-xs shadow-xl">
                        <p className="text-muted">{formatWeekRangeUk(String(payload[0].payload.week))}</p>
                        <p className="tabular font-medium">{payload[0].value}/100</p>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="score" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {chart.map((d) => <Cell key={d.week} fill={BAND_COLOR[scoreBand(d.score)]} />)}
                  <LabelList dataKey="score" position="top" fill="var(--color-muted)" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {reviews.length > 0 && (
        <Card className="p-2 sm:p-3">
          <ul className="divide-y divide-line">
            {reviews.map((r) => (
              <li key={r.id}>
                <Link href={`/reviews/${r.week_start}`} className="flex items-center gap-4 rounded-xl px-2 py-3 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      Тиждень {r.stats.weekNumber}
                      {!r.seen_at && <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">нове</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {formatWeekRangeUk(r.week_start)} · {r.stats.productiveDays}/7 продуктивних
                    </p>
                  </div>
                  {r.stats.delta !== null && (
                    <span className={`tabular text-xs ${r.stats.delta > 0 ? "text-good" : r.stats.delta < 0 ? "text-low" : "text-muted"}`}>
                      {r.stats.delta > 0 ? `↑ +${r.stats.delta}` : r.stats.delta < 0 ? `↓ ${r.stats.delta}` : "±0"}
                    </span>
                  )}
                  <ScoreBadge score={r.score} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
