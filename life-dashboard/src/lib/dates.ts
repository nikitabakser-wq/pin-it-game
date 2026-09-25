// All calendar dates are handled as local "YYYY-MM-DD" strings to avoid timezone drift.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function today(): string {
  return toISODate(new Date());
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function diffDays(a: string, b: string): number {
  // a - b in whole days
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86_400_000);
}

/** Start of the week containing `s`. weekStartsOn: 1 = Monday, 0 = Sunday. */
export function weekStart(s: string, weekStartsOn = 1): string {
  const d = parseISODate(s);
  const offset = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - offset);
  return toISODate(d);
}

export function monthKey(s: string): string {
  return s.slice(0, 7);
}

export function rangeDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatLong(s: string): string {
  return parseISODate(s).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatShort(s: string): string {
  return parseISODate(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatMonth(s: string): string {
  return parseISODate(s.length === 7 ? `${s}-01` : s).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export function formatDeadline(s: string | null): string | null {
  if (!s) return null;
  return parseISODate(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatWeek(start: string): string {
  return `${formatShort(start)} – ${formatShort(addDays(start, 6))}`;
}

/** Human text for how far a deadline is from today. */
export function deadlineLabel(deadline: string, ref = today()): string {
  const d = diffDays(deadline, ref);
  if (d < 0) return `${-d} day${d === -1 ? "" : "s"} overdue`;
  if (d === 0) return "due today";
  if (d === 1) return "due tomorrow";
  if (d < 60) return `in ${d} days`;
  return formatDeadline(deadline) ?? "";
}
