"use client";

import Link from "next/link";
import { formatShort } from "@/lib/dates";
import { scoreBand } from "@/lib/score";
import { BAND_COLOR, BAND_LABEL } from "./ui";

/** Compact bar strip of daily scores. Every bar has a text tooltip and a link. */
export function ScoreStrip({ days }: { days: { date: string; score: number | null }[] }) {
  return (
    <div className="flex h-16 items-end gap-[2px]" role="list" aria-label="Daily scores">
      {days.map((d) => {
        const band = scoreBand(d.score);
        const h = d.score === null ? 6 : Math.max(8, d.score);
        return (
          <Link
            key={d.date}
            role="listitem"
            href={`/day/${d.date}`}
            className="group relative flex h-full flex-1 items-end"
            aria-label={`${formatShort(d.date)}: ${d.score === null ? "no activity" : `score ${d.score}`}`}
          >
            <span
              className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
              style={{ height: `${h}%`, background: d.score === null ? "var(--color-surface-3)" : BAND_COLOR[band] }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface-3 px-2 py-1 text-[11px] group-hover:block">
              {formatShort(d.date)} · {d.score === null ? BAND_LABEL.none : d.score}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
