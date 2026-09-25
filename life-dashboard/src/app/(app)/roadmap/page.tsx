"use client";

import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { addDays, formatDeadline, monthKey, today, weekStart } from "@/lib/dates";
import { areaProgress } from "@/lib/progress";
import type { RoadmapItem, RoadmapStage } from "@/lib/types";
import { Button, Card, cx, EmptyState, Field, Input, Modal, PageHeader, ProgressBar, Select } from "@/components/ui";

export default function RoadmapPage() {
  const { data, update, insert, remove } = useStore();
  const [stage, setStage] = useState<Partial<RoadmapStage> | null>(null);
  const [item, setItem] = useState<Partial<RoadmapItem> | null>(null);
  const [key, setKey] = useState(0);
  const t = today();
  const wso = data.settings?.week_starts_on ?? 1;

  const actionsToday = data.activities.filter((a) => a.date === t).length;
  const actionsWeek = data.activities.filter((a) => a.date >= weekStart(t, wso) && a.date <= t).length;
  const actionsMonth = data.activities.filter((a) => monthKey(a.date) === monthKey(t)).length;
  const actionsTotal = data.activities.length;
  const current = data.stages.find((s) => (!s.start_date || s.start_date <= t) && (!s.end_date || s.end_date >= t)) ?? data.stages[0];

  const openStage = (s: Partial<RoadmapStage>) => { setKey((k) => k + 1); setStage(s); };
  const openItem = (i: Partial<RoadmapItem>) => { setKey((k) => k + 1); setItem(i); };

  return (
    <div className="animate-fade-in">
      <PageHeader title="🗺️ Roadmap" subtitle="Where all of this is going." action={<Button variant="primary" onClick={() => openStage({ position: data.stages.length })}><Plus size={16} /> Stage</Button>} />

      {/* small actions → long-term progress */}
      <Card className="mb-6">
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-0" aria-label="From small actions to long-term progress">
          {[
            { v: actionsToday, l: "actions today" },
            { v: actionsWeek, l: "this week" },
            { v: actionsMonth, l: "this month" },
            { v: actionsTotal, l: "all time" },
            { v: current ? current.title : "—", l: "current stage" },
          ].map((s, i, arr) => (
            <li key={s.l} className="relative flex flex-col items-center text-center">
              <span className={cx("tabular font-semibold", i === arr.length - 1 ? "text-lg text-accent" : "text-2xl")} style={{ opacity: 0.55 + i * 0.11 }}>{s.v}</span>
              <span className="text-[11px] text-muted">{s.l}</span>
              {i < arr.length - 1 && <span className="absolute top-3 -right-2 hidden text-faint sm:block" aria-hidden>→</span>}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-center text-[11px] text-faint">Small actions → long-term progress</p>
      </Card>

      {data.stages.length === 0 ? (
        <EmptyState title="No roadmap yet" text="Add stages like “Age 14 · Sep 2026 → Jul 2027” and the big outcomes you want in each." action={<Button variant="primary" onClick={() => openStage({ position: 0 })}><Plus size={16} /> Add first stage</Button>} />
      ) : (
        <ol className="relative space-y-6 border-l border-line pl-6 sm:pl-8">
          {data.stages.map((s) => {
            const items = data.roadmapItems.filter((i) => i.stage_id === s.id);
            const done = items.filter((i) => i.done).length;
            const isCurrent = s.id === current?.id;
            const past = !!s.end_date && s.end_date < t;
            let timePct: number | null = null;
            if (s.start_date && s.end_date && s.start_date <= t) {
              const total = new Date(s.end_date).getTime() - new Date(s.start_date).getTime();
              timePct = Math.min(100, Math.round(((new Date(t).getTime() - new Date(s.start_date).getTime()) / total) * 100));
            }
            return (
              <li key={s.id} className="relative">
                <span className={cx("absolute top-5 -left-[31px] size-3.5 rounded-full border-2 sm:-left-[39px]", isCurrent ? "border-accent bg-accent shadow-[0_0_14px_var(--color-accent)]" : past ? "border-good bg-good" : "border-line-strong bg-bg")} aria-hidden />
                <Card className={cx(isCurrent && "border-accent/40")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                        {s.start_date ? formatDeadline(s.start_date) : "…"} → {s.end_date ? formatDeadline(s.end_date) : "…"}
                        {isCurrent && <span className="ml-2 text-accent">now</span>}
                      </p>
                      <h2 className="mt-1 text-2xl font-semibold tracking-tight">{s.title.toUpperCase()}</h2>
                      {s.subtitle && <p className="text-sm text-muted">{s.subtitle}</p>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => openStage(s)}><Pencil size={13} /> Edit</Button>
                  </div>
                  {items.length > 0 && (
                    <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
                      <div>
                        <div className="mb-1 flex justify-between"><span>Outcomes achieved</span><span className="tabular">{done}/{items.length}</span></div>
                        <ProgressBar value={(done / items.length) * 100} size="sm" color="var(--color-good)" />
                      </div>
                      {timePct !== null && (
                        <div>
                          <div className="mb-1 flex justify-between"><span>Time elapsed</span><span className="tabular">{timePct}%</span></div>
                          <ProgressBar value={timePct} size="sm" color="var(--color-faint)" />
                        </div>
                      )}
                    </div>
                  )}
                  <ul className="mt-4 space-y-1">
                    {items.map((i) => {
                      const area = data.areas.find((a) => a.id === i.area_id);
                      const ap = area ? areaProgress(area, data.categories, data.goals).value : null;
                      return (
                        <li key={i.id} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                          <button
                            role="checkbox"
                            aria-checked={i.done}
                            aria-label={i.title}
                            onClick={() => update("roadmap_items", i.id, { done: !i.done })}
                            className={cx("flex size-5 shrink-0 items-center justify-center rounded-md border", i.done ? "border-good bg-good text-[#06140e]" : "border-line-strong")}
                          >
                            {i.done && <Check size={13} strokeWidth={3} />}
                          </button>
                          <span className={cx("min-w-0 flex-1 text-sm", i.done && "text-faint line-through")}>
                            {area?.icon} {i.title}
                          </span>
                          {ap !== null && <span className="tabular text-xs text-muted" title={`${area!.name} is at ${ap}%`}>{ap}%</span>}
                          <button onClick={() => openItem(i)} className="rounded p-1 text-faint hover:text-fg sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Edit ${i.title}`}><Pencil size={13} /></button>
                        </li>
                      );
                    })}
                  </ul>
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => openItem({ stage_id: s.id, position: items.length })}><Plus size={14} /> Outcome</Button>
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      <StageEditor key={`s${key}`} draft={stage} onClose={() => setStage(null)} onSave={(row) => (stage?.id ? update("roadmap_stages", stage.id, row) : insert("roadmap_stages", row))} onDelete={stage?.id ? () => remove("roadmap_stages", stage.id!) : undefined} />
      <ItemEditor key={`i${key}`} draft={item} onClose={() => setItem(null)} onSave={(row) => (item?.id ? update("roadmap_items", item.id, row) : insert("roadmap_items", row))} onDelete={item?.id ? () => remove("roadmap_items", item.id!) : undefined} />
    </div>
  );
}

function StageEditor({ draft, onClose, onSave, onDelete }: {
  draft: Partial<RoadmapStage> | null;
  onClose: () => void;
  onSave: (row: Partial<RoadmapStage>) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
}) {
  const d = draft ?? {};
  const [title, setTitle] = useState(d.title ?? "");
  const [subtitle, setSubtitle] = useState(d.subtitle ?? "");
  const [start, setStart] = useState(d.start_date ?? today());
  const [end, setEnd] = useState(d.end_date ?? addDays(today(), 364));
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); onClose(); } finally { setBusy(false); } };
  return (
    <Modal open={!!draft} onClose={onClose} title={d.id ? "Edit stage" : "New stage"} footer={
      <>
        {onDelete && <Button variant="danger" className="mr-auto" disabled={busy} onClick={() => confirm("Delete this stage and its outcomes?") && run(onDelete)}><Trash2 size={14} /> Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={busy || !title.trim()} onClick={() => run(() => onSave({ title: title.trim(), subtitle: subtitle.trim() || null, start_date: start || null, end_date: end || null, position: d.position ?? 0 }))}>Save</Button>
      </>
    }>
      <Field label="Title"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Age 15" /></Field>
      <Field label="Subtitle"><Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="e.g. Scale up" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function ItemEditor({ draft, onClose, onSave, onDelete }: {
  draft: Partial<RoadmapItem> | null;
  onClose: () => void;
  onSave: (row: Partial<RoadmapItem>) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
}) {
  const { data } = useStore();
  const d = draft ?? {};
  const [title, setTitle] = useState(d.title ?? "");
  const [areaId, setAreaId] = useState(d.area_id ?? "");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); onClose(); } finally { setBusy(false); } };
  return (
    <Modal open={!!draft} onClose={onClose} title={d.id ? "Edit outcome" : "New outcome"} footer={
      <>
        {onDelete && <Button variant="danger" className="mr-auto" disabled={busy} onClick={() => run(onDelete)}><Trash2 size={14} /> Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={busy || !title.trim()} onClick={() => run(() => onSave({ title: title.trim(), area_id: areaId || null, stage_id: d.stage_id, position: d.position ?? 0 }))}>Save</Button>
      </>
    }>
      <Field label="Outcome"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Reach B2 English" /></Field>
      <Field label="Linked area (shows its live progress)">
        <Select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          <option value="">— None —</option>
          {data.areas.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
        </Select>
      </Field>
    </Modal>
  );
}
