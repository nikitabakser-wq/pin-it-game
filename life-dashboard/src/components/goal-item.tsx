"use client";

import { Check, Pencil } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { deadlineLabel, today } from "@/lib/dates";
import type { Goal } from "@/lib/types";
import { useEditors } from "./editors";
import { cx, PriorityDot } from "./ui";

export function GoalItem({ goal, showArea = true, onDate }: { goal: Goal; showArea?: boolean; onDate?: string }) {
  const { data, toggleGoal } = useStore();
  const { editGoal } = useEditors();
  const [busy, setBusy] = useState(false);
  const area = data.areas.find((a) => a.id === goal.area_id);
  const cat = data.categories.find((c) => c.id === goal.category_id);
  const due = goal.kind === "task" ? null : goal.deadline;
  const overdue = !goal.completed && (
    (goal.kind === "task" && goal.scheduled_for && goal.scheduled_for < today()) || (due && due < today())
  );

  const toggle = async () => {
    setBusy(true);
    try {
      await toggleGoal(goal, onDate ?? (goal.kind === "task" && goal.scheduled_for && goal.scheduled_for < today() ? goal.scheduled_for : undefined));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="group flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2">
      <button
        onClick={toggle}
        disabled={busy}
        role="checkbox"
        aria-checked={goal.completed}
        aria-label={`${goal.completed ? "Mark not done" : "Mark done"}: ${goal.title}`}
        className={cx(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-all",
          goal.completed ? "border-good bg-good text-[#06140e]" : "border-line-strong hover:border-accent",
          busy && "opacity-50",
        )}
      >
        {goal.completed && <Check size={14} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cx("text-sm leading-5", goal.completed && "text-faint line-through")}>{goal.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
          <PriorityDot priority={goal.priority} />
          {showArea && area && <span>{area.icon} {area.name}</span>}
          {cat && <span>· {cat.name}</span>}
          {goal.kind === "task" && goal.scheduled_for && goal.scheduled_for !== today() && (
            <span className={cx(overdue && "text-low")}>· {deadlineLabel(goal.scheduled_for).replace("due ", "")}</span>
          )}
          {due && <span className={cx(overdue && "text-low")}>· {deadlineLabel(due)}</span>}
          {goal.notes && <span className="truncate text-faint">· {goal.notes}</span>}
        </div>
      </div>
      <button
        onClick={() => editGoal(goal)}
        className="rounded-lg p-1.5 text-faint opacity-100 transition hover:bg-surface-3 hover:text-fg sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
        aria-label={`Edit ${goal.title}`}
      >
        <Pencil size={14} />
      </button>
    </li>
  );
}

export function GoalList({ goals, empty, showArea, onDate }: { goals: Goal[]; empty?: React.ReactNode; showArea?: boolean; onDate?: string }) {
  if (!goals.length) return <>{empty ?? null}</>;
  const sorted = [...goals].sort(
    (a, b) =>
      Number(a.completed) - Number(b.completed) ||
      ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]) ||
      a.created_at.localeCompare(b.created_at),
  );
  return (
    <ul className="-mx-2 space-y-0.5">
      {sorted.map((g) => (
        <GoalItem key={g.id} goal={g} showArea={showArea} onDate={onDate} />
      ))}
    </ul>
  );
}
