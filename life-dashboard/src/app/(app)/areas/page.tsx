"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { areaProgress } from "@/lib/progress";
import { useEditors } from "@/components/editors";
import { Button, Card, PageHeader, ProgressBar } from "@/components/ui";

export default function AreasPage() {
  const { data, update } = useStore();
  const { editArea } = useEditors();
  const move = async (i: number, dir: -1 | 1) => {
    const order = [...data.areas];
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    for (const [pos, a] of order.entries()) {
      if (a.position !== pos) await update("areas", a.id, { position: pos });
    }
  };
  return (
    <div className="animate-fade-in">
      <PageHeader title="Areas" subtitle="The parts of life you are building." action={<Button variant="primary" onClick={() => editArea({})}><Plus size={16} /> New area</Button>} />
      <Card>
        <ul className="divide-y divide-line">
          {data.areas.map((a, i) => {
            const p = areaProgress(a, data.categories, data.goals);
            return (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <div className="flex flex-col">
                  <button className="text-faint hover:text-fg disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${a.name} up`}>▲</button>
                  <button className="text-faint hover:text-fg disabled:opacity-20" disabled={i === data.areas.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${a.name} down`}>▼</button>
                </div>
                <span className="text-xl">{a.icon}</span>
                <Link href={`/areas/${a.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.name} {a.archived && <span className="text-xs text-faint">(archived)</span>}</p>
                  <ProgressBar value={p.value} color={a.color} size="sm" className="mt-1.5" />
                </Link>
                <span className="tabular w-12 text-right text-sm font-semibold">{p.value}%</span>
                <Button size="sm" variant="ghost" onClick={() => editArea(a)}>Edit</Button>
              </li>
            );
          })}
        </ul>
        {!data.areas.length && <p className="text-sm text-muted">No areas yet.</p>}
      </Card>
    </div>
  );
}
