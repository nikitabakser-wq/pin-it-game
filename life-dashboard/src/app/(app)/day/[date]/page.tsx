"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { addDays, formatLong, today } from "@/lib/dates";
import { scoreBand } from "@/lib/score";
import { useEditors } from "@/components/editors";
import { GoalList } from "@/components/goal-item";
import { BAND_COLOR, BAND_LABEL, Button, Card, EmptyState, Input, ProgressBar, Ring, SectionTitle, Textarea } from "@/components/ui";

export default function DayPage() {
  const { date } = useParams<{ date: string }>();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return <EmptyState title="Invalid date" action={<Link href="/" className="text-sm text-accent">Back</Link>} />;
  }
  return <Day key={date} date={date} />;
}

function Day({ date }: { date: string }) {
  const { data, dayScore, saveLog } = useStore();
  const { editGoal, editActivity } = useEditors();
  const log = data.dailyLogs.find((l) => l.date === date);
  const s = dayScore(date);
  const band = scoreBand(s.score);
  const tasks = data.goals.filter((g) => g.kind === "task" && g.scheduled_for === date);
  const acts = data.activities.filter((a) => a.date === date).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const otherCompleted = data.goals.filter((g) => g.kind !== "task" && g.completed_on === date);
  const [notes, setNotes] = useState(log?.notes ?? "");
  const [notesState, setNotesState] = useState<"idle" | "saving" | "saved">("idle");
  const [override, setOverride] = useState(log?.manual_score != null ? String(log.manual_score) : "");
  const isToday = date === today();
  const totalWeight = s.components.filter((c) => c.ratio !== null && c.weight > 0).reduce((a, c) => a + c.weight, 0);

  const saveNotes = async () => {
    if ((log?.notes ?? "") === notes) return;
    setNotesState("saving");
    await saveLog(date, { notes: notes.trim() || null });
    setNotesState("saved");
  };
  const saveOverride = async (value: string) => {
    const n = value === "" ? null : Math.max(0, Math.min(100, parseInt(value, 10)));
    await saveLog(date, { manual_score: Number.isNaN(n) ? null : n });
  };

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex items-center justify-between gap-3">
        <Link href={`/day/${addDays(date, -1)}`} className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Previous day"><ChevronLeft size={20} /></Link>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">{isToday ? "Today" : "Daily log"}</p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{formatLong(date)}</h1>
        </div>
        <Link href={`/day/${addDays(date, 1)}`} className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Next day"><ChevronRight size={20} /></Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <SectionTitle>Daily score</SectionTitle>
          <div className="flex items-center gap-5">
            <Ring value={s.score ?? 0} size={112} stroke={10} color={BAND_COLOR[band]}>
              <span className="tabular text-3xl font-semibold">{s.score ?? "—"}</span>
              <span className="text-[10px] text-muted">/ 100</span>
            </Ring>
            <div className="text-sm">
              <p className="font-medium">{BAND_LABEL[band]}{s.manual && " · set manually"}</p>
              {s.manual && s.computed !== null && <p className="text-xs text-muted">Calculated: {s.computed}</p>}
              <p className="mt-1 text-xs text-muted">
                {s.areaIds.length} area{s.areaIds.length === 1 ? "" : "s"} · {acts.length} action{acts.length === 1 ? "" : "s"}
                {s.minutes ? ` · ${s.minutes} min` : ""}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {s.components.map((c) => {
              const applicable = c.ratio !== null && c.weight > 0;
              const pts = applicable && totalWeight ? Math.round(((c.weight * (c.ratio ?? 0)) / totalWeight) * 100) : 0;
              return (
                <div key={c.key} className={applicable ? "" : "opacity-50"}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span>{c.label} <span className="text-faint">· weight {c.weight}</span></span>
                    <span className="tabular text-muted">{applicable ? `+${pts}` : "n/a"}</span>
                  </div>
                  <ProgressBar value={(c.ratio ?? 0) * 100} size="sm" color="var(--color-accent)" label={c.label} />
                  <p className="mt-0.5 text-[11px] text-faint">{c.detail}</p>
                </div>
              );
            })}
            <p className="text-[11px] text-faint">
              Components with nothing to measure are skipped and the rest are rescaled. <Link href="/settings" className="underline hover:text-fg">Edit the formula</Link>.
            </p>
          </div>

          <div className="mt-5 flex items-end gap-2 border-t border-line pt-4">
            <label className="flex-1">
              <span className="mb-1.5 block text-xs font-medium text-muted">Manual override (0–100)</span>
              <Input type="number" min={0} max={100} inputMode="numeric" placeholder="Use calculated score" value={override} onChange={(e) => setOverride(e.target.value)} />
            </label>
            <Button onClick={() => saveOverride(override)}>Save</Button>
            {s.manual && <Button variant="ghost" onClick={() => { setOverride(""); void saveOverride(""); }}>Reset</Button>}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => editGoal({ kind: "task", scheduled_for: date })}><Plus size={14} /> Task</Button>}>
              Planned tasks · {tasks.filter((t) => t.completed).length}/{tasks.length}
            </SectionTitle>
            <GoalList goals={tasks} onDate={date} empty={<p className="text-sm text-muted">No tasks planned for this day.</p>} />
          </Card>

          <Card>
            <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => editActivity({ date })}><Plus size={14} /> Log</Button>}>
              Completed
            </SectionTitle>
            {s.areaIds.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {s.areaIds.map((id) => {
                  const a = data.areas.find((x) => x.id === id);
                  return a ? (
                    <Link key={id} href={`/areas/${id}`} className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs hover:bg-surface-3">{a.icon} {a.name}</Link>
                  ) : null;
                })}
              </div>
            )}
            {acts.length === 0 ? (
              <p className="text-sm text-muted">Nothing recorded. Complete a task or log what you did.</p>
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {acts.map((a) => {
                  const area = data.areas.find((x) => x.id === a.area_id);
                  return (
                    <li key={a.id}>
                      <button onClick={() => editActivity(a)} className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left text-sm hover:bg-surface-2">
                        <span className="text-good" aria-hidden>☑</span>
                        <span className="min-w-0 flex-1">
                          {area && <span className="text-muted">{area.name} — </span>}
                          {a.description}
                        </span>
                        {a.minutes ? <span className="tabular text-xs text-muted">{a.minutes} min</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {otherCompleted.length > 0 && (
              <p className="mt-2 text-[11px] text-faint">Includes {otherCompleted.length} weekly/long-term goal{otherCompleted.length === 1 ? "" : "s"} completed this day.</p>
            )}
          </Card>

          <Card>
            <SectionTitle>
              Notes {notesState === "saving" ? <span className="normal-case tracking-normal text-faint">· saving…</span> : notesState === "saved" ? <span className="normal-case tracking-normal text-good">· saved</span> : null}
            </SectionTitle>
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setNotesState("idle"); }}
              onBlur={saveNotes}
              placeholder="How did the day go? What did you learn?"
              aria-label="Notes"
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={saveNotes} disabled={(log?.notes ?? "") === notes}>Save notes</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
