"use client";

import Link from "next/link";
import { ChartLine, History, LayoutGrid, ListChecks, LogOut, Map, Settings, Trophy } from "lucide-react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui";

const LINKS = [
  { href: "/goals", label: "Goals & tasks", sub: "Tasks, weekly goals, milestones", icon: ListChecks },
  { href: "/areas", label: "Areas", sub: "Create, edit, reorder", icon: LayoutGrid },
  { href: "/reviews", label: "Weekly Review", sub: "Підсумок тижня та історія", icon: Trophy },
  { href: "/history", label: "History", sub: "Days, weeks, months", icon: History },
  { href: "/stats", label: "Statistics", sub: "Progress & consistency", icon: ChartLine },
  { href: "/roadmap", label: "Roadmap", sub: "Long-term direction", icon: Map },
  { href: "/settings", label: "Settings", sub: "Score formula, profile, export", icon: Settings },
];

export default function MorePage() {
  const { signOut, user } = useStore();
  return (
    <div className="animate-fade-in">
      <PageHeader title="More" />
      <div className="grid gap-2 sm:grid-cols-2">
        {LINKS.map(({ href, label, sub, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-4 transition hover:bg-surface-2">
            <span className="flex size-10 items-center justify-center rounded-xl bg-surface-3 text-accent"><Icon size={19} /></span>
            <span>
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-muted">{sub}</span>
            </span>
          </Link>
        ))}
      </div>
      <button onClick={signOut} className="mt-6 flex items-center gap-2 text-sm text-muted hover:text-fg">
        <LogOut size={15} /> Sign out ({user?.email})
      </button>
    </div>
  );
}
