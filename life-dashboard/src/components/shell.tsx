"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ChartLine, History, LayoutGrid, ListChecks, LogOut, Map, Plus, Settings, Sun } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { today } from "@/lib/dates";
import { useEditors } from "./editors";
import { Button, cx, Modal } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: `/day`, label: "Today", icon: Sun },
  { href: "/goals", label: "Goals", icon: ListChecks },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/history", label: "History", icon: History },
  { href: "/stats", label: "Statistics", icon: ChartLine },
  { href: "/roadmap", label: "Roadmap", icon: Map },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data, signOut, user, error, clearError } = useStore();
  const { editGoal, editActivity } = useEditors();
  const [quick, setQuick] = useState(false);
  const hrefFor = (href: string) => (href === "/day" ? `/day/${today()}` : href);

  return (
    <div className="app-glow min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface/60 px-3 py-5 backdrop-blur lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-3">
          <span className="size-2.5 rounded-full bg-accent shadow-[0_0_12px_var(--color-accent)]" />
          <span className="text-sm font-semibold tracking-[0.18em]">LIFE PROGRESS</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={hrefFor(href)}
              className={cx(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                isActive(pathname, href) ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon size={17} strokeWidth={1.8} />
              {label}
            </Link>
          ))}
          {data.areas.filter((a) => !a.archived).length > 0 && (
            <>
              <p className="mt-5 mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Areas</p>
              {data.areas.filter((a) => !a.archived).map((a) => (
                <Link
                  key={a.id}
                  href={`/areas/${a.id}`}
                  className={cx(
                    "flex items-center gap-3 truncate rounded-xl px-3 py-1.5 text-sm transition-colors",
                    pathname === `/areas/${a.id}` ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <span className="w-4 text-center">{a.icon}</span>
                  <span className="truncate">{a.name}</span>
                </Link>
              ))}
            </>
          )}
        </nav>
        <div className="space-y-2 border-t border-line pt-3">
          <Button variant="primary" className="w-full" onClick={() => setQuick(true)}>
            <Plus size={16} /> Add
          </Button>
          <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs text-faint hover:text-fg" title={user?.email ?? ""}>
            <LogOut size={14} /> <span className="truncate">Sign out · {user?.email}</span>
          </button>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-6xl px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-28 sm:px-6 lg:pb-12 lg:pl-[17rem] lg:pr-8 lg:pt-8">
        {error && (
          <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-low/30 bg-low/10 px-4 py-3 text-sm text-low">
            <span>Something went wrong: {error}</span>
            <button onClick={clearError} className="text-xs underline">Dismiss</button>
          </div>
        )}
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 items-center">
          {[NAV[0], NAV[1]].map(({ href, label, icon: Icon }) => (
            <MobileLink key={href} href={hrefFor(href)} label={label} active={isActive(pathname, href)} Icon={Icon} />
          ))}
          <div className="flex justify-center">
            <button
              onClick={() => setQuick(true)}
              aria-label="Add"
              className="-mt-6 flex size-14 items-center justify-center rounded-2xl bg-accent text-[#0b0c10] shadow-[0_8px_30px_-6px_var(--color-accent)] transition active:scale-95"
            >
              <Plus size={26} />
            </button>
          </div>
          <MobileLink href="/calendar" label="Calendar" active={isActive(pathname, "/calendar")} Icon={CalendarDays} />
          <MobileLink href="/more" label="More" active={["/more", "/goals", "/history", "/stats", "/roadmap", "/settings"].some((p) => isActive(pathname, p))} Icon={LayoutGrid} />
        </div>
      </nav>

      <Modal open={quick} onClose={() => setQuick(false)} title="Add">
        <div className="grid gap-2">
          {[
            { label: "Task for today", sub: "Counts toward today's score", fn: () => editGoal({ kind: "task", scheduled_for: today() }) },
            { label: "Log an activity", sub: "Something you already did", fn: () => editActivity({ date: today() }) },
            { label: "Weekly goal", sub: "An objective for this week", fn: () => editGoal({ kind: "weekly" }) },
            { label: "Goal / milestone", sub: "Longer-term, with a deadline", fn: () => editGoal({ kind: "goal" }) },
          ].map((o) => (
            <button
              key={o.label}
              onClick={() => { setQuick(false); o.fn(); }}
              className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-left transition hover:border-line-strong hover:bg-surface-3"
            >
              <p className="text-sm font-medium">{o.label}</p>
              <p className="text-xs text-muted">{o.sub}</p>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function MobileLink({ href, label, active, Icon }: { href: string; label: string; active: boolean; Icon: typeof LayoutGrid }) {
  return (
    <Link href={href} className={cx("flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium", active ? "text-fg" : "text-faint")}>
      <Icon size={21} strokeWidth={active ? 2.2 : 1.8} />
      {label}
    </Link>
  );
}
