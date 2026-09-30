import { scoreBand } from "./score";
import type { WeekStats } from "./types";
import { daysWord, formatWeekRangeUk, weekdayName, weekdayShort, capitalize } from "./weekly";

// Shareable weekly card, drawn on a <canvas> in the browser (no server, system fonts,
// so Cyrillic and emoji render like on the phone). Only aggregated numbers are shown —
// never notes or activity descriptions.

export type CardFormat = "story" | "post";
export const CARD_SIZE: Record<CardFormat, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  post: { w: 1080, h: 1350 },
};

const C = {
  bg: "#08090c",
  surface: "#161920",
  track: "#1d2029",
  line: "#2f3442",
  fg: "#eceef3",
  muted: "#8d93a3",
  faint: "#5d6373",
  accent: "#8b8fff",
  good: "#34d399",
  mid: "#fbbf24",
  low: "#f87171",
};
const BAND = { none: C.track, low: C.low, medium: C.mid, high: C.good } as const;
const FONT = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

export interface CardOptions {
  format: CardFormat;
  /** Optional handle / name shown at the bottom, e.g. "@nikita". */
  signature?: string;
}

export interface CardLine {
  text: string;
  color?: string;
}

/** The metric lines on the card — only numbers that exist in the stats. */
export function cardLines(s: WeekStats, max: number): CardLine[] {
  const lines: CardLine[] = [];
  if (s.scoredDays) lines.push({ text: `🔥 ${s.productiveDays}/7 продуктивних днів` });
  for (const a of s.areas.filter((x) => x.days > 0)) {
    lines.push({ text: `${daysWord(a.days)} — ${a.name}`, color: a.color });
  }
  if (s.tasks.planned > 0) lines.push({ text: `✅ ${s.tasks.done}/${s.tasks.planned} задач виконано` });
  if (s.weeklyGoals.total > 0) lines.push({ text: `🎯 ${s.weeklyGoals.done}/${s.weeklyGoals.total} тижневих цілей` });
  return lines.slice(0, max);
}

/** Ready-to-paste caption for the post. */
export function cardCaption(s: WeekStats): string {
  const out = [`Тиждень ${s.weekNumber}: ${s.score ?? "—"}/100${s.score !== null && s.score >= 75 ? " 🔥" : ""}`];
  if (s.delta !== null && s.delta !== 0) out.push(`${s.delta > 0 ? "↑ +" : "↓ "}${s.delta} від минулого тижня`);
  out.push("");
  if (s.scoredDays) out.push(`${s.productiveDays}/7 продуктивних днів`);
  for (const a of s.areas.filter((x) => x.days > 0).slice(0, 4)) out.push(`${a.name} — ${daysWord(a.days)}`);
  if (s.best) out.push(`Найкращий день: ${weekdayName(s.best.date)} (${s.best.score})`);
  out.push("", "#мійтиждень #дисципліна #прогрес");
  return out.join("\n");
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function setFont(ctx: CanvasRenderingContext2D, size: number, weight = 500, spacing = 0) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  // letterSpacing is supported in modern Chromium/Safari; ignored elsewhere.
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${spacing}px`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function drawWeekCard(canvas: HTMLCanvasElement, s: WeekStats, opts: CardOptions) {
  const { w: W, h: H } = CARD_SIZE[opts.format];
  const story = opts.format === "story";
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const band = BAND[scoreBand(s.score)];
  const P = 88; // side padding

  // Background with two soft glows
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W * 0.1, 0, 0, W * 0.1, 0, W * 0.9);
  g1.addColorStop(0, "rgba(139,143,255,0.22)");
  g1.addColorStop(1, "rgba(139,143,255,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(W, H * 0.55, 0, W, H * 0.55, W * 0.8);
  g2.addColorStop(0, `${band}33`);
  g2.addColorStop(1, `${band}00`);
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "alphabetic";
  let y = story ? 170 : 120;

  // Header
  ctx.textAlign = "left";
  ctx.fillStyle = C.accent;
  ctx.beginPath();
  ctx.arc(P + 9, y - 11, 9, 0, Math.PI * 2);
  ctx.fill();
  setFont(ctx, 28, 700, 7);
  ctx.fillText("LIFE PROGRESS", P + 32, y);
  setFont(ctx, 28, 500, 2);
  ctx.fillStyle = C.muted;
  ctx.textAlign = "right";
  ctx.fillText("WEEKLY REVIEW", W - P, y);

  y += story ? 110 : 90;
  ctx.textAlign = "left";
  ctx.fillStyle = C.fg;
  setFont(ctx, story ? 88 : 76, 800, -1);
  ctx.fillText(`Тиждень ${s.weekNumber}`, P, y);
  y += story ? 58 : 50;
  setFont(ctx, story ? 38 : 34, 500);
  ctx.fillStyle = C.muted;
  ctx.fillText(formatWeekRangeUk(s.weekStart), P, y);

  // Score ring
  const R = story ? 230 : 150;
  const stroke = story ? 34 : 26;
  const cx = story ? W / 2 : P + R + stroke / 2;
  const cy = y + (story ? 90 : 70) + R;
  ctx.lineCap = "round";
  ctx.lineWidth = stroke;
  ctx.strokeStyle = C.track;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  const v = Math.max(0, Math.min(100, s.score ?? 0)) / 100;
  if (v > 0) {
    ctx.strokeStyle = band;
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v);
    ctx.stroke();
  }
  ctx.textAlign = "center";
  ctx.fillStyle = C.fg;
  setFont(ctx, story ? 190 : 130, 800, -4);
  ctx.fillText(s.score === null ? "—" : String(s.score), cx, cy + (story ? 62 : 42));
  setFont(ctx, story ? 40 : 30, 500);
  ctx.fillStyle = C.muted;
  ctx.fillText("/ 100", cx, cy + (story ? 120 : 86));

  const deltaColor = s.delta === null || s.delta === 0 ? C.muted : s.delta > 0 ? C.good : C.low;
  let lines = cardLines(s, story ? 5 : 4);
  let my: number;
  const lineH = story ? 70 : 62;

  if (story) {
    // Delta pill under the ring
    const deltaText =
      s.delta === null ? "Перший тиждень з даними" : s.delta === 0 ? "На рівні минулого тижня" : `${s.delta > 0 ? "↑ +" : "↓ "}${s.delta} від минулого тижня`;
    setFont(ctx, 38, 600);
    const pw = ctx.measureText(deltaText).width + 64;
    const ph = 76;
    const px = W / 2 - pw / 2;
    const py = cy + R + 56;
    roundRect(ctx, px, py, pw, ph, ph / 2);
    ctx.fillStyle = `${deltaColor}1f`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `${deltaColor}66`;
    ctx.stroke();
    ctx.fillStyle = deltaColor;
    ctx.textAlign = "center";
    ctx.fillText(deltaText, W / 2, py + ph / 2 + 13);
    my = py + ph + 90;
  } else {
    // Two big numbers to the right of the ring
    const rx = cx + R + stroke / 2 + 72;
    const stat = (value: string, label: string, color: string, top: number) => {
      ctx.textAlign = "left";
      setFont(ctx, 76, 800, -1);
      ctx.fillStyle = color;
      ctx.fillText(fit(ctx, value, W - P - rx), rx, top);
      setFont(ctx, 30, 500);
      ctx.fillStyle = C.muted;
      ctx.fillText(fit(ctx, label, W - P - rx), rx, top + 46);
    };
    stat(
      s.delta === null ? "—" : s.delta === 0 ? "±0" : `${s.delta > 0 ? "↑ +" : "↓ "}${s.delta}`,
      s.delta === null ? "перший тиждень з даними" : "від минулого тижня",
      deltaColor,
      cy - 40,
    );
    stat(`🔥 ${s.productiveDays}/7`, "продуктивних днів", C.fg, cy + 110);
    lines = lines.filter((l) => !l.text.startsWith("🔥")).slice(0, 3);
    my = cy + R + stroke / 2 + 100;
  }

  // Metrics
  const mx = P;
  const mw = W - 2 * P;
  ctx.textAlign = "left";
  for (const l of lines) {
    setFont(ctx, story ? 44 : 38, 600);
    let tx = mx;
    if (l.color) {
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.arc(mx + 13, my - (story ? 15 : 13), story ? 13 : 12, 0, Math.PI * 2);
      ctx.fill();
      tx = mx + (story ? 50 : 44);
    }
    ctx.fillStyle = C.fg;
    ctx.fillText(fit(ctx, l.text, mw - (tx - mx)), tx, my);
    my += lineH;
  }

  // 7-day strip
  const stripTop = story ? H - 450 : H - 360;
  const stripH = story ? 190 : 150;
  const gap = 16;
  const bw = (W - 2 * P - gap * 6) / 7;
  s.days.forEach((d, i) => {
    const x = P + i * (bw + gap);
    const h = d.score === null ? 12 : Math.max(18, (d.score / 100) * stripH);
    roundRect(ctx, x, stripTop + stripH - h, bw, h, 10);
    ctx.fillStyle = d.score === null ? C.track : BAND[scoreBand(d.score)];
    ctx.fill();
    ctx.textAlign = "center";
    setFont(ctx, story ? 30 : 26, 600);
    ctx.fillStyle = d.score === null ? C.faint : C.fg;
    if (d.score !== null) ctx.fillText(String(d.score), x + bw / 2, stripTop + stripH - h - 14);
    setFont(ctx, story ? 28 : 24, 500);
    ctx.fillStyle = C.muted;
    ctx.fillText(weekdayShort(d.date), x + bw / 2, stripTop + stripH + (story ? 50 : 42));
  });

  // Best day + footer
  const footY = H - (story ? 110 : 70);
  ctx.textAlign = "left";
  setFont(ctx, story ? 34 : 30, 500);
  ctx.fillStyle = C.muted;
  if (s.best) ctx.fillText(`🏆 Найкращий день: ${capitalize(weekdayName(s.best.date))} — ${s.best.score}`, P, footY);
  ctx.textAlign = "right";
  setFont(ctx, story ? 34 : 30, 600);
  ctx.fillStyle = C.fg;
  const sig = opts.signature?.trim();
  if (sig) ctx.fillText(fit(ctx, sig, W / 2 - P), W - P, footY);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not render the image"))), "image/png"),
  );
}
