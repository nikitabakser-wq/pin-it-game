"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BellOff, Minus, RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { notificationPermission, requestNotifications, showNotification, type NotifyPermission } from "@/lib/notify";
import { scoreBand } from "@/lib/score";
import type { WeeklyReview, WeekStats } from "@/lib/types";
import {
  aiPayload,
  capitalize,
  computeWeekStats,
  daysWord,
  firstDataDate,
  formatWeekRangeUk,
  reviewNotification,
  reviewsDue,
  ruleAnalysis,
  sessionsWord,
  statsSignature,
  hoursUk,
  weekdayName,
  weekdayShort,
  type WeekAnalysis,
} from "@/lib/weekly";
import { ScoreStrip } from "./score-spark";
import { BAND_COLOR, Button, Card, cx, Ring, SectionTitle } from "./ui";

// ───────────────────────── analysis (AI with rule-based fallback) ─────────────────────────

export async function analyzeWeek(stats: WeekStats, tryAI: boolean): Promise<WeekAnalysis & { source: "ai" | "rules" }> {
  if (tryAI && stats.score !== null) {
    try {
      const res = await fetch("/api/weekly-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(aiPayload(stats)),
      });
      if (res.ok) {
        const body = (await res.json()) as WeekAnalysis;
        if (body.summary && body.recommendations?.length) return { ...body, source: "ai" };
      }
    } catch {
      // network problem → rules
    }
  }
  return { ...ruleAnalysis(stats), source: "rules" };
}

export function useBuildReview() {
  const { data, dayScore, saveWeeklyReview } = useStore();
  return async (weekStart: string, opts: { final: boolean; tryAI: boolean }) => {
    const stats = computeWeekStats(data, weekStart, dayScore);
    if (stats.score === null) return null;
    const analysis = await analyzeWeek(stats, opts.tryAI);
    return saveWeeklyReview({
      week_start: weekStart,
      score: stats.score,
      stats,
      summary: analysis.summary,
      recommendations: analysis.recommendations,
      source: analysis.source,
      final: opts.final,
    });
  };
}

// ───────────────────────── autopilot: one review per finished week ─────────────────────────

/**
 * Mounted once in the app shell. On load (and every 15 minutes) it makes sure every finished
 * week has exactly one saved review, prepares the current week's review on its last evening,
 * and rebuilds that early review once the week is really over.
 */
export function WeeklyReviewAutopilot() {
  const { data, dayScore, weeklyReviewsReady } = useStore();
  const build = useBuildReview();
  const latest = useRef({ data, dayScore, build });
  const running = useRef(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    latest.current = { data, dayScore, build };
  });

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!weeklyReviewsReady) return;
    // Debounced: runs after data settles (e.g. after a task was ticked) and on the 15-minute tick.
    const t = setTimeout(async () => {
      if (running.current) return;
      running.current = true;
      try {
        const { data: d, dayScore: ds, build: b } = latest.current;
        const due = reviewsDue(new Date(), d.settings?.week_starts_on ?? 1, firstDataDate(d));
        for (const [i, w] of due.entries()) {
          const existing = d.weeklyReviews.find((r) => r.week_start === w.weekStart);
          if (existing?.final) continue; // finished weeks are reviewed once
          if (existing && !w.final) {
            // The week is still running: refresh only when its data actually changed.
            if (statsSignature(computeWeekStats(d, w.weekStart, ds)) === statsSignature(existing.stats)) continue;
          }
          // Only the newest week is sent to the AI automatically; older ones use the built-in analysis.
          const saved = await b(w.weekStart, { final: w.final, tryAI: i === 0 });
          if (saved && !existing && i === 0) {
            const n = reviewNotification(saved.stats);
            await showNotification(`review-${saved.week_start}`, n.title, n.body, `/reviews/${saved.week_start}`);
          }
        }
      } catch {
        // a failed save is retried on the next run
      } finally {
        running.current = false;
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [weeklyReviewsReady, tick, data]);

  return null;
}

// ───────────────────────── "review is ready" banner (dashboard) ─────────────────────────

export function WeeklyReviewBanner() {
  const { data, update } = useStore();
  const latest = [...data.weeklyReviews].sort((a, b) => b.week_start.localeCompare(a.week_start))[0];
  if (!latest || latest.seen_at) return null;
  const n = reviewNotification(latest.stats);
  return (
    <div className="animate-fade-in relative overflow-hidden rounded-2xl border border-accent/30 bg-accent/10 p-4 sm:p-5">
      <button
        onClick={() => update("weekly_reviews", latest.id, { seen_at: new Date().toISOString() })}
        className="absolute top-3 right-3 rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg"
        aria-label="Сховати"
      >
        <X size={16} />
      </button>
      <p className="pr-8 text-sm font-semibold">{n.title}</p>
      <p className="mt-1 pr-8 text-sm text-fg/85">{n.body}</p>
      <Link href={`/reviews/${latest.week_start}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
        Переглянути повний аналіз <ArrowRight size={14} />
      </Link>
    </div>
  );
}

// ───────────────────────── review screen ─────────────────────────

export function DeltaPill({ delta, className }: { delta: number | null; className?: string }) {
  if (delta === null) return <span className={cx("text-xs text-muted", className)}>Перший тиждень з даними</span>;
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const tone = delta > 0 ? "text-good bg-good/10 border-good/25" : delta < 0 ? "text-low bg-low/10 border-low/25" : "text-muted bg-surface-2 border-line";
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium tabular", tone, className)}>
      <Icon size={13} />
      {delta > 0 ? `+${delta}` : delta === 0 ? "±0" : delta} від минулого тижня
    </span>
  );
}

function Metric({ value, label, sub, color }: { value: string; label: string; sub?: string; color?: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-surface-2 px-3.5 py-3">
      {color && <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
      <div className="min-w-0">
        <p className="text-sm">
          <span className="tabular text-lg font-semibold">{value}</span> <span className="text-fg/85">{label}</span>
        </p>
        {sub && <p className="text-[11px] text-muted">{sub}</p>}
      </div>
    </li>
  );
}

function DayCard({ title, day, tone }: { title: string; day: { date: string; score: number }; tone: string }) {
  return (
    <Link href={`/day/${day.date}`} className="block rounded-2xl border border-line bg-surface p-4 transition hover:bg-surface-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</p>
      <p className="mt-2 text-lg font-semibold">{capitalize(weekdayName(day.date))}</p>
      <p className="tabular text-2xl font-semibold" style={{ color: tone }}>
        {day.score}<span className="text-sm font-normal text-muted">/100</span>
      </p>
    </Link>
  );
}

export function ReviewView({
  stats,
  review,
  onRefresh,
  refreshing,
}: {
  stats: WeekStats;
  review?: WeeklyReview | null;
  onRefresh?: (tryAI: boolean) => void;
  refreshing?: boolean;
}) {
  const analysis = review ? { summary: review.summary ?? "", recommendations: review.recommendations } : ruleAnalysis(stats);
  const band = scoreBand(stats.score);
  const worked = stats.areas.filter((a) => a.days > 0);
  const idle = stats.areas.filter((a) => a.days === 0);

  if (stats.score === null) {
    return (
      <Card className="text-center">
        <p className="text-4xl">📭</p>
        <p className="mt-3 text-base font-semibold">Недостатньо даних</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          За тиждень {formatWeekRangeUk(stats.weekStart)} немає жодної оцінки дня. Відмічай задачі й записуй активності — і тут зʼявиться підсумок.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full opacity-20 blur-3xl" style={{ background: BAND_COLOR[band] }} aria-hidden />
        <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
          <Ring value={stats.score} size={132} stroke={11} color={BAND_COLOR[band]}>
            <span className="tabular text-4xl font-semibold">{stats.score}</span>
            <span className="text-[11px] text-muted">/ 100</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">🏆 Weekly Review</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Тиждень {stats.weekNumber} · {formatWeekRangeUk(stats.weekStart)}
            </h2>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <DeltaPill delta={stats.delta} />
              {stats.prevScore !== null && <span className="text-xs text-muted">минулого: {stats.prevScore}/100</span>}
            </div>
            <p className="mt-3 text-[11px] text-faint">
              Середнє з оцінок {daysWord(stats.scoredDays)} цього тижня
              {review && !review.final && " · тиждень ще триває, підсумок оновиться після його завершення"}
            </p>
          </div>
        </div>
        <div className="relative mt-5 border-t border-line pt-4">
          <ScoreStrip days={stats.days.map((d) => ({ date: d.date, score: d.score }))} />
          <div className="mt-1 grid grid-cols-7 text-center text-[10px] text-faint">
            {stats.days.map((d) => <span key={d.date}>{weekdayShort(d.date)}</span>)}
          </div>
        </div>
      </Card>

      {/* This week */}
      <Card>
        <SectionTitle>Цього тижня</SectionTitle>
        <ul className="grid gap-2 sm:grid-cols-2">
          <Metric value={`${stats.productiveDays}/7`} label="продуктивних днів" sub={`день з оцінкою ${stats.productiveThreshold}+`} />
          {worked.map((a) => (
            <Metric
              key={a.areaId}
              value={daysWord(a.days)}
              label={`· ${a.icon} ${a.name}`}
              sub={[sessionsWord(a.sessions), a.minutes ? hoursUk(a.minutes) : null].filter(Boolean).join(" · ")}
              color={a.color}
            />
          ))}
          {stats.tasks.planned > 0 && <Metric value={`${stats.tasks.done}/${stats.tasks.planned}`} label="запланованих задач виконано" />}
          {stats.weeklyGoals.total > 0 && <Metric value={`${stats.weeklyGoals.done}/${stats.weeklyGoals.total}`} label="тижневих цілей закрито" />}
          {stats.goalsCompleted > 0 && <Metric value={String(stats.goalsCompleted)} label="великих цілей досягнуто" />}
          {stats.minutes > 0 && <Metric value={hoursUk(stats.minutes)} label="записаного часу" />}
        </ul>
        {idle.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            Без активності: {idle.map((a) => `${a.icon} ${a.name}`).join(", ")}
          </p>
        )}
      </Card>

      {/* Best / worst */}
      {stats.best && (
        <div className="grid grid-cols-2 gap-3">
          <DayCard title="Найкращий день" day={stats.best} tone="var(--color-good)" />
          {stats.worst && stats.worst.date !== stats.best.date ? (
            <DayCard title="Найслабший день" day={stats.worst} tone={BAND_COLOR[scoreBand(stats.worst.score)]} />
          ) : (
            <div className="flex items-center rounded-2xl border border-dashed border-line-strong p-4 text-xs text-muted">
              Замало оцінених днів, щоб визначити найслабший.
            </div>
          )}
        </div>
      )}

      {/* Analysis */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -bottom-16 -left-16 size-48 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <SectionTitle
          action={
            onRefresh && (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" disabled={refreshing} onClick={() => onRefresh(false)} title="Перерахувати з актуальних даних">
                  <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Оновити
                </Button>
                <Button size="sm" variant="ghost" disabled={refreshing} onClick={() => onRefresh(true)} title="Потрібен ANTHROPIC_API_KEY на сервері">
                  <Sparkles size={13} /> AI
                </Button>
              </div>
            )
          }
        >
          {review?.source === "ai" ? "AI Analysis" : "Аналіз тижня"}
        </SectionTitle>
        <p className="relative text-[15px] leading-relaxed">{analysis.summary}</p>
        {stats.patterns.length > 0 && (
          <ul className="relative mt-3 space-y-1">
            {stats.patterns.map((p) => (
              <li key={p} className="text-xs text-muted">· {p}</li>
            ))}
          </ul>
        )}
        <p className="relative mt-3 text-[10px] text-faint">
          {review?.source === "ai" ? "Написано AI лише на основі твоїх записів" : "Автоматичний аналіз на основі твоїх записів"}
        </p>
      </Card>

      {/* Next week */}
      {analysis.recommendations.length > 0 && (
        <Card>
          <SectionTitle>Next week</SectionTitle>
          <ol className="space-y-3">
            {analysis.recommendations.map((r, i) => (
              <li key={i} className="flex gap-3">
                <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-xs font-semibold text-accent">{i + 1}</span>
                <p className="text-sm leading-relaxed">{r}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

// ───────────────────────── browser notifications toggle ─────────────────────────

export function NotificationToggle() {
  const [perm, setPerm] = useState<NotifyPermission>("unsupported");
  useEffect(() => {
    // Permission is only readable in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPerm(notificationPermission());
  }, []);
  if (perm === "unsupported") return null;
  if (perm === "granted") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Bell size={13} className="text-good" /> Сповіщення про новий підсумок увімкнені
      </p>
    );
  }
  if (perm === "denied") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <BellOff size={13} /> Сповіщення заблоковані в налаштуваннях браузера
      </p>
    );
  }
  return (
    <Button size="sm" variant="ghost" onClick={async () => setPerm(await requestNotifications())}>
      <Bell size={13} /> Сповіщати, коли підсумок готовий
    </Button>
  );
}
