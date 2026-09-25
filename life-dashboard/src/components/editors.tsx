"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { today, weekStart } from "@/lib/dates";
import type { Activity, Area, Category, Goal, GoalKind, Priority, ProgressMode } from "@/lib/types";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

// One place for every create/edit dialog, so any page (or the mobile "+" button) can open them.

type GoalDraft = Partial<Goal>;
type ActivityDraft = Partial<Activity>;
type CategoryDraft = Partial<Category> & { area_id: string };

interface Editors {
  editGoal: (g?: GoalDraft) => void;
  editActivity: (a?: ActivityDraft) => void;
  editArea: (a?: Partial<Area>) => void;
  editCategory: (c: CategoryDraft) => void;
}

const Ctx = createContext<Editors | null>(null);
export function useEditors() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useEditors outside provider");
  return c;
}

export function EditorsProvider({ children }: { children: React.ReactNode }) {
  const [goal, setGoal] = useState<GoalDraft | null>(null);
  const [activity, setActivity] = useState<ActivityDraft | null>(null);
  const [area, setArea] = useState<Partial<Area> | null>(null);
  const [category, setCategory] = useState<CategoryDraft | null>(null);
  // A fresh key per open resets each form's internal state.
  const [key, setKey] = useState(0);
  const bump = () => setKey((k) => k + 1);

  const api: Editors = {
    editGoal: (g = {}) => (bump(), setGoal(g)),
    editActivity: (a = {}) => (bump(), setActivity(a)),
    editArea: (a = {}) => (bump(), setArea(a)),
    editCategory: (c) => (bump(), setCategory(c)),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <GoalEditor key={`g${key}`} draft={goal} onClose={() => setGoal(null)} />
      <ActivityEditor key={`a${key}`} draft={activity} onClose={() => setActivity(null)} />
      <AreaEditor key={`r${key}`} draft={area} onClose={() => setArea(null)} />
      <CategoryEditor key={`c${key}`} draft={category} onClose={() => setCategory(null)} />
    </Ctx.Provider>
  );
}

function useSaving() {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, after: () => void) => {
    setSaving(true);
    setErr(null);
    try {
      await fn();
      after();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  return { saving, err, run };
}

const nil = (s: string | undefined | null) => (s && s.trim() ? s.trim() : null);

function AreaCategorySelect({ areaId, categoryId, onArea, onCategory }: {
  areaId: string;
  categoryId: string;
  onArea: (v: string) => void;
  onCategory: (v: string) => void;
}) {
  const { data } = useStore();
  const cats = data.categories.filter((c) => c.area_id === areaId);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Area">
        <Select value={areaId} onChange={(e) => (onArea(e.target.value), onCategory(""))}>
          <option value="">— None —</option>
          {data.areas.filter((a) => !a.archived).map((a) => (
            <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Category">
        <Select value={categoryId} onChange={(e) => onCategory(e.target.value)} disabled={!cats.length}>
          <option value="">— None —</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

// ───────────────────────── Goal / weekly goal / task ─────────────────────────
function GoalEditor({ draft, onClose }: { draft: GoalDraft | null; onClose: () => void }) {
  const { insert, update, remove, data } = useStore();
  const { saving, err, run } = useSaving();
  const d = draft ?? {};
  const weekStartsOn = data.settings?.week_starts_on ?? 1;
  const [kind, setKind] = useState<GoalKind>(d.kind ?? "task");
  const [title, setTitle] = useState(d.title ?? "");
  const [areaId, setAreaId] = useState(d.area_id ?? "");
  const [categoryId, setCategoryId] = useState(d.category_id ?? "");
  const [priority, setPriority] = useState<Priority>(d.priority ?? "medium");
  const [deadline, setDeadline] = useState(d.deadline ?? "");
  const [week, setWeek] = useState(d.week_start ?? weekStart(today(), weekStartsOn));
  const [scheduled, setScheduled] = useState(d.scheduled_for ?? today());
  const [notes, setNotes] = useState(d.notes ?? "");

  const save = () =>
    run(async () => {
      const row = {
        kind,
        title: title.trim(),
        area_id: areaId || null,
        category_id: categoryId || null,
        priority,
        deadline: nil(deadline),
        week_start: kind === "weekly" ? weekStart(week, weekStartsOn) : null,
        scheduled_for: kind === "task" ? scheduled || today() : null,
        notes: nil(notes),
      };
      if (d.id) await update("goals", d.id, row);
      else await insert("goals", row);
    }, onClose);

  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title={d.id ? "Edit goal" : "New goal"}
      footer={
        <>
          {d.id && (
            <Button variant="danger" className="mr-auto" disabled={saving} onClick={() => confirm("Delete this goal?") && run(() => remove("goals", d.id!), onClose)}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving || !title.trim()} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <Field label="Type">
        <Select value={kind} onChange={(e) => setKind(e.target.value as GoalKind)}>
          <option value="task">Task for a day</option>
          <option value="weekly">Weekly goal</option>
          <option value="goal">Goal / milestone</option>
        </Select>
      </Field>
      <Field label="Title">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Practice speaking for 30 min" onKeyDown={(e) => e.key === "Enter" && title.trim() && save()} />
      </Field>
      <AreaCategorySelect areaId={areaId} categoryId={categoryId} onArea={setAreaId} onCategory={setCategoryId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </Field>
        {kind === "task" && (
          <Field label="Planned for">
            <Input type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
          </Field>
        )}
        {kind === "weekly" && (
          <Field label="Week of">
            <Input type="date" value={week} onChange={(e) => setWeek(e.target.value)} />
          </Field>
        )}
        {kind === "goal" && (
          <Field label="Deadline">
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        )}
      </div>
      {kind !== "goal" && (
        <Field label="Deadline (optional)">
          <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      )}
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {kind === "goal" && <p className="text-[11px] text-faint">Milestone goals drive task-based progress for their area/category.</p>}
      {err && <p className="text-sm text-low">{err}</p>}
    </Modal>
  );
}

// ───────────────────────── Activity (daily log entry) ─────────────────────────
function ActivityEditor({ draft, onClose }: { draft: ActivityDraft | null; onClose: () => void }) {
  const { insert, update, remove } = useStore();
  const { saving, err, run } = useSaving();
  const d = draft ?? {};
  const [date, setDate] = useState(d.date ?? today());
  const [areaId, setAreaId] = useState(d.area_id ?? "");
  const [categoryId, setCategoryId] = useState(d.category_id ?? "");
  const [description, setDescription] = useState(d.description ?? "");
  const [minutes, setMinutes] = useState(d.minutes != null ? String(d.minutes) : "");

  const save = () =>
    run(async () => {
      const row = {
        date,
        area_id: areaId || null,
        category_id: categoryId || null,
        description: description.trim(),
        minutes: minutes ? Math.max(0, parseInt(minutes, 10) || 0) : null,
      };
      if (d.id) await update("activities", d.id, row);
      else await insert("activities", row);
    }, onClose);

  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title={d.id ? "Edit activity" : "Log activity"}
      footer={
        <>
          {d.id && (
            <Button variant="danger" className="mr-auto" disabled={saving} onClick={() => run(() => remove("activities", d.id!), onClose)}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving || !description.trim()} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <Field label="What did you do?">
        <Input autoFocus value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 40 min speaking practice" onKeyDown={(e) => e.key === "Enter" && description.trim() && save()} />
      </Field>
      <AreaCategorySelect areaId={areaId} categoryId={categoryId} onArea={setAreaId} onCategory={setCategoryId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Minutes (optional)">
          <Input type="number" inputMode="numeric" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="30" />
        </Field>
      </div>
      {err && <p className="text-sm text-low">{err}</p>}
    </Modal>
  );
}

// ───────────────────────── Area ─────────────────────────
// Categorical palette validated for colour-blind separation on the dark surface (fixed order).
export const AREA_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9", "#008300", "#e66767"];
const COLORS = AREA_COLORS;

function ModeSelect({ value, onChange, forArea }: { value: ProgressMode; onChange: (v: ProgressMode) => void; forArea?: boolean }) {
  return (
    <Field
      label="Progress calculation"
      hint={
        value === "manual"
          ? forArea
            ? "Average of the categories (or the value below if there are none)."
            : "You set the percentage yourself."
          : value === "tasks"
            ? "Share of completed milestone goals."
            : "Average of manual value and completed milestone goals."
      }
    >
      <Select value={value} onChange={(e) => onChange(e.target.value as ProgressMode)}>
        <option value="manual">{forArea ? "From categories / manual" : "Manual"}</option>
        <option value="tasks">From goals</option>
        <option value="mixed">Combined</option>
      </Select>
    </Field>
  );
}

function AreaEditor({ draft, onClose }: { draft: Partial<Area> | null; onClose: () => void }) {
  const { insert, update, remove, data } = useStore();
  const router = useRouter();
  const { saving, err, run } = useSaving();
  const d = draft ?? {};
  const [name, setName] = useState(d.name ?? "");
  const [icon, setIcon] = useState(d.icon ?? "⭐");
  const [color, setColor] = useState(d.color ?? COLORS[data.areas.length % COLORS.length]);
  const [description, setDescription] = useState(d.description ?? "");
  const [mainGoal, setMainGoal] = useState(d.main_goal ?? "");
  const [deadline, setDeadline] = useState(d.deadline ?? "");
  const [mode, setMode] = useState<ProgressMode>(d.progress_mode ?? "manual");
  const [manual, setManual] = useState(d.manual_progress ?? 0);
  const [archived, setArchived] = useState(d.archived ?? false);
  const hasCats = !!d.id && data.categories.some((c) => c.area_id === d.id);

  const save = () =>
    run(async () => {
      const row = {
        name: name.trim(),
        icon: icon.trim() || "⭐",
        color,
        description: nil(description),
        main_goal: nil(mainGoal),
        deadline: nil(deadline),
        progress_mode: mode,
        manual_progress: manual,
        archived,
      };
      if (d.id) await update("areas", d.id, row);
      else await insert("areas", { ...row, position: data.areas.length });
    }, onClose);

  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title={d.id ? "Edit area" : "New area"}
      footer={
        <>
          {d.id && (
            <Button
              variant="danger"
              className="mr-auto"
              disabled={saving}
              onClick={() => confirm(`Delete "${d.name}" with all its categories and goals? This cannot be undone.`) && run(() => remove("areas", d.id!), () => { onClose(); router.push("/"); })}
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving || !name.trim()} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[5rem_1fr] gap-3">
        <Field label="Icon">
          <Input value={icon} onChange={(e) => setIcon(e.target.value)} className="text-center text-lg" maxLength={8} aria-label="Icon (emoji)" />
        </Field>
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. English" />
        </Field>
      </div>
      <Field label="Color">
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Color ${c}`} aria-pressed={color === c}
              className="size-7 rounded-full ring-offset-2 ring-offset-surface transition" style={{ background: c, boxShadow: color === c ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${c}` : undefined }} />
          ))}
        </div>
      </Field>
      <Field label="Main goal">
        <Input value={mainGoal} onChange={(e) => setMainGoal(e.target.value)} placeholder="e.g. Reach B2" />
      </Field>
      <Field label="Deadline">
        <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </Field>
      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </Field>
      <ModeSelect value={mode} onChange={setMode} forArea />
      {mode !== "tasks" && !hasCats && (
        <Field label={`Manual progress — ${manual}%`}>
          <input type="range" min={0} max={100} value={manual} onChange={(e) => setManual(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
        </Field>
      )}
      {d.id && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archived (hidden from dashboard and overall progress)
        </label>
      )}
      {err && <p className="text-sm text-low">{err}</p>}
    </Modal>
  );
}

// ───────────────────────── Category ─────────────────────────
function CategoryEditor({ draft, onClose }: { draft: CategoryDraft | null; onClose: () => void }) {
  const { insert, update, remove, data } = useStore();
  const { saving, err, run } = useSaving();
  const d = draft ?? ({} as CategoryDraft);
  const [name, setName] = useState(d.name ?? "");
  const [progress, setProgress] = useState(d.progress ?? 0);
  const [mode, setMode] = useState<ProgressMode>(d.progress_mode ?? "manual");
  const [target, setTarget] = useState(d.target ?? "");
  const [deadline, setDeadline] = useState(d.deadline ?? "");
  const [notes, setNotes] = useState(d.notes ?? "");

  const save = () =>
    run(async () => {
      const row = {
        name: name.trim(),
        progress,
        progress_mode: mode,
        target: nil(target),
        deadline: nil(deadline),
        notes: nil(notes),
      };
      if (d.id) await update("categories", d.id, row);
      else
        await insert("categories", {
          ...row,
          area_id: d.area_id,
          position: data.categories.filter((c) => c.area_id === d.area_id).length,
        });
    }, onClose);

  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title={d.id ? "Edit category" : "New category"}
      footer={
        <>
          {d.id && (
            <Button variant="danger" className="mr-auto" disabled={saving} onClick={() => confirm(`Delete category "${d.name}"?`) && run(() => remove("categories", d.id!), onClose)}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving || !name.trim()} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Speaking" />
      </Field>
      <ModeSelect value={mode} onChange={setMode} />
      {mode !== "tasks" && (
        <Field label={`Current progress — ${progress}%`}>
          <input type="range" min={0} max={100} value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" aria-label="Current progress" />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target (optional)">
          <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. B2 level" />
        </Field>
        <Field label="Deadline (optional)">
          <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {err && <p className="text-sm text-low">{err}</p>}
    </Modal>
  );
}
