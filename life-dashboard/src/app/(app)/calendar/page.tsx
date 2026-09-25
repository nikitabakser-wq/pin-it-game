"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { addDays, formatMonth, monthKey, parseISODate, rangeDays, today, toISODate, weekStart } from "@/lib/dates";
import { scoreBand } from "@/lib/score";
import { BAND_COLOR, BAND_LABEL, Button, Card, cx, PageHeader } from "@/components/ui";

export default function CalendarPage() {
  const { data, dayScore } = useStore();
  const t = today();
  const [month, setMonth] = useState(monthKey(t));
  const wso = data.settings?.week_starts_on ?? 1;

  const first = `${month}-01`;
  const d = parseISODate(first);
  const last = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const gridStart = weekStart(first, wso);
  const gridEnd = addDays(weekStart(last, wso), 6);
  const days = rangeDays(gridStart, gridEnd);
  const shift = (n: number) => setMonth(monthKey(toISODate(new Date(d.getFullYear(), d.getMonth() + n, 1))));

  const monthScores = rangeDays(first, last < t ? last : t).map(dayScore);
  const scored = monthScores.filter((s) => s.score !== null);
  const avg = scored.length ? Math.round(scored.reduce((a, s) => a + (s.score ?? 0), 0) / scored.length) : null;
  const weekdayNames = Array.from({ length: 7 }, (_, i) => parseISODate(addDays(gridStart, i)).toLocaleDateString("en-GB", { weekday: "short" }));

  return (
    <div className="animate-fade-in">
      <PageHeader title="📅 Calendar" subtitle={`${formatMonth(month)} · ${scored.length} active day${scored.length === 1 ? "" : "s"}${avg !== null ? ` · average score ${avg}` : ""}`} />
      <Card className="p-3 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16} /></Button>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{formatMonth(month)}</h2>
            {month !== monthKey(t) && <button onClick={() => setMonth(monthKey(t))} className="text-xs text-accent">Today</button>}
          </div>
          <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={16} /></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {weekdayNames.map((w) => (
            <div key={w} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-faint">{w}</div>
          ))}
          {days.map((day) => {
            const inMonth = monthKey(day) === month;
            const s = dayScore(day);
            const band = scoreBand(s.score);
            const future = day > t;
            const areas = s.areaIds.map((id) => data.areas.find((a) => a.id === id)?.icon).filter(Boolean);
            const label = `${parseISODate(day).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}: ${s.score === null ? "no activity" : `score ${s.score} (${BAND_LABEL[band].toLowerCase()})`}`;
            return (
              <Link
                key={day}
                href={`/day/${day}`}
                title={label}
                aria-label={label}
                className={cx(
                  "group relative flex aspect-square flex-col rounded-lg border p-1 transition sm:aspect-[1.1] sm:rounded-xl sm:p-2",
                  inMonth ? "border-line bg-surface-2 hover:border-line-strong" : "border-transparent opacity-35",
                  day === t && "ring-2 ring-accent",
                )}
                style={s.score !== null ? { background: `color-mix(in oklab, ${BAND_COLOR[band]} ${8 + Math.round(s.score / 5)}%, var(--color-surface-2))` } : undefined}
              >
                <span className={cx("text-[11px] sm:text-xs", day === t ? "font-semibold text-accent" : "text-muted")}>{parseISODate(day).getDate()}</span>
                {s.score !== null ? (
                  <span className="tabular mt-auto text-center text-sm font-semibold sm:text-lg">{s.score}</span>
                ) : (
                  <span className="mt-auto text-center text-xs text-faint">{future ? "" : "·"}</span>
                )}
                {s.score !== null && <span className="mx-auto mt-0.5 h-1 w-3/5 rounded-full" style={{ background: BAND_COLOR[band] }} aria-hidden />}
                {areas.length > 0 && <span className="mt-1 hidden truncate text-center text-[10px] leading-none sm:block">{areas.join("")}</span>}
              </Link>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted" aria-label="Legend">
          {(["high", "medium", "low", "none"] as const).map((b) => (
            <span key={b} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: BAND_COLOR[b] }} />
              {BAND_LABEL[b]} {b === "high" ? "(75+)" : b === "medium" ? "(40–74)" : b === "low" ? "(<40)" : ""}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
