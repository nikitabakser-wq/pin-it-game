"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { addDays, today, weekStart } from "@/lib/dates";
import { computeWeekStats } from "@/lib/weekly";
import { ReviewView, useBuildReview } from "@/components/weekly-review";
import { EmptyState } from "@/components/ui";

export default function WeekReviewPage() {
  const { week } = useParams<{ week: string }>();
  const { data, dayScore, update, weeklyReviewsReady } = useStore();
  const build = useBuildReview();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wso = data.settings?.week_starts_on ?? 1;

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(week);
  const start = valid ? weekStart(week, wso) : "";
  const review = data.weeklyReviews.find((r) => r.week_start === start) ?? null;

  // Opening a review marks it as seen (hides the dashboard banner).
  useEffect(() => {
    if (review && !review.seen_at) void update("weekly_reviews", review.id, { seen_at: new Date().toISOString() }).catch(() => {});
  }, [review, update]);

  if (!valid) return <EmptyState title="Невірний тиждень" action={<Link href="/reviews" className="text-sm text-accent">До всіх тижнів</Link>} />;

  // A saved review shows its snapshot; otherwise the week is calculated live from current data.
  const stats = review?.stats ?? computeWeekStats(data, start, dayScore);
  const current = weekStart(today(), wso);
  const isFuture = start > current;

  const refresh = async (tryAI: boolean) => {
    setRefreshing(true);
    setError(null);
    try {
      const saved = await build(start, { final: start < current, tryAI });
      if (tryAI && saved && saved.source !== "ai") setError("AI недоступний (не задано ANTHROPIC_API_KEY) — показано автоматичний аналіз.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/reviews" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <ChevronLeft size={14} /> Усі тижні
        </Link>
        <div className="flex items-center gap-1">
          <Link href={`/reviews/${addDays(start, -7)}`} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Попередній тиждень">
            <ChevronLeft size={18} />
          </Link>
          {start < current && (
            <Link href={`/reviews/${addDays(start, 7)}`} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Наступний тиждень">
              <ChevronRight size={18} />
            </Link>
          )}
        </div>
      </div>
      {start === current && !review && stats.score !== null && (
        <p className="rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-xs text-muted">
          Тиждень ще триває — це попередній підсумок за вже записані дні.
        </p>
      )}
      {error && <p className="rounded-xl border border-mid/30 bg-mid/10 px-4 py-2.5 text-xs text-mid">{error}</p>}
      {isFuture ? (
        <EmptyState title="Цей тиждень ще не почався" />
      ) : (
        <ReviewView stats={stats} review={review} refreshing={refreshing} onRefresh={weeklyReviewsReady && stats.score !== null ? refresh : undefined} />
      )}
    </div>
  );
}
