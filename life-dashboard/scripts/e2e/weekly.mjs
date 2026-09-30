// End-to-end check of Weekly Review (needs migration 0002). Run after flow.mjs or on its own:
//   BASE_URL=http://localhost:3000 node scripts/e2e/weekly.mjs
// Uses the real clock: it fills the previous and the current week with activity.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
const day = (offset) => iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset));
const lastWeek = day(-7);
const isSundayEvening = now.getDay() === 0 && now.getHours() >= 18;
// Review target: the current week on Sunday evening, otherwise last week.
const target = isSundayEvening ? day(0) : lastWeek;
const targetDays = [0, 1, 2, 4].map((i) => (target === lastWeek ? day(i - 7) : day(i)));

let step = 0;
const ok = (m) => console.log(`✔ ${++step}. ${m}`);
const expect = (c, m) => { if (!c) throw new Error(`FAILED: ${m}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = async (name, p = page) => SHOTS && (await p.waitForTimeout(900), p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }));
process.on("uncaughtException", async (e) => { console.error(e.message); await shot("weekly-failure").catch(() => {}); process.exit(1); });
const modal = () => page.locator("dialog[open]");
const save = async () => { await modal().getByRole("button", { name: "Save" }).click(); await page.waitForFunction(() => !document.querySelector("dialog[open]")); };

// Account with the starter areas
await page.goto(`${BASE}/login`);
await page.getByRole("button", { name: /Create the owner account/ }).click();
await page.getByLabel("Email").fill(`weekly+${Date.now()}@example.com`);
await page.getByLabel("Password").fill("correct-horse-1");
await page.getByRole("button", { name: "Create account" }).click();
await page.getByRole("button", { name: "Use the 5 suggested areas" }).click();
await page.getByText("Today's focus", { exact: false }).waitFor();
await page.goto(`${BASE}/reviews`);
await page.getByText("Ще немає завершених тижнів").waitFor();
ok("no data → no fake review");

// Fill the target week (and one day of the week before, for the comparison)
const entries = [
  [targetDays[0], "🏋️ Gym", "Workout", "60"],
  [targetDays[0], "🇬🇧 English", "Speaking practice", "30"],
  [targetDays[1], "🇬🇧 English", "Grammar lesson", "40"],
  [targetDays[2], "🏋️ Gym", "Workout", "50"],
  [targetDays[2], "🎥 Content", "Edited video", ""],
  [targetDays[3], "🇬🇧 English", "Reading", "20"],
  [addDaysIso(target, -6), "🏋️ Gym", "Workout", ""],
];
function addDaysIso(s, n) { const [y, m, d] = s.split("-").map(Number); return iso(new Date(y, m - 1, d + n)); }
for (const [date, areaLabel, what, minutes] of entries) {
  await page.goto(`${BASE}/day/${date}`);
  await page.getByRole("button", { name: "Log" }).click();
  await modal().getByLabel("What did you do?").fill(what);
  await modal().getByLabel("Area").selectOption({ label: areaLabel });
  if (minutes) await modal().getByLabel("Minutes (optional)").fill(minutes);
  await save();
}
await page.goto(`${BASE}/day/${targetDays[1]}`);
await page.getByLabel("Notes").fill("Tired, but did the lesson.");
await page.getByRole("button", { name: "Save notes" }).click();
await page.getByText("· saved").waitFor();
ok("activities logged across the week");

// Daily scores from the existing Day page
const scores = [];
for (const d of targetDays) {
  await page.goto(`${BASE}/day/${d}`);
  const t = (await page.locator("main").getByText(/^\d+$/).first().textContent())?.trim();
  scores.push(Number(t));
}
const expected = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
ok(`daily scores ${scores.join(", ")} → expected weekly ${expected}`);

// Reopening the app creates the review automatically and shows the banner
await page.goto(`${BASE}/`);
await page.getByText("🏆 Тижневий підсумок готовий!").waitFor({ timeout: 15000 });
const banner = await page.getByText(/Цього тижня: \d+\/100/).first().textContent();
expect(banner.includes(`${expected}/100`), `banner shows the weekly score (${banner})`);
await shot("weekly-banner");
ok("review created on open; dashboard banner shows it");

// No duplicates after several reloads
for (let i = 0; i < 3; i++) { await page.reload(); await page.getByText("Today's focus", { exact: false }).waitFor(); }
await page.goto(`${BASE}/reviews`);
const rows = page.locator("main ul li a[href^='/reviews/']");
await rows.first().waitFor();
const hrefs = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
expect(new Set(hrefs).size === hrefs.length, `no duplicate weeks in the list (${hrefs.join(", ")})`);
expect(hrefs.includes(`/reviews/${target}`), "target week listed");
await shot("weekly-list");
ok(`history lists ${hrefs.length} week(s), no duplicates after reloads`);

// Full review
await page.goto(`${BASE}/reviews/${target}`);
await page.getByText("🏆 Weekly Review").waitFor();
const big = (await page.locator("main").getByText(/^\d+$/).first().textContent())?.trim();
expect(Number(big) === expected, `review score ${big} = average of daily scores ${expected}`);
for (const t of ["Цього тижня", "продуктивних днів", "Найкращий день", "Найслабший день", "Next week", "Без активності"]) {
  await page.getByText(t, { exact: false }).first().waitFor();
}
expect(await page.getByText("🇬🇧 English").first().isVisible(), "English metric shown");
expect(!(await page.getByText("опубліков").count()), "no invented metrics");
await page.getByRole("button", { name: /AI/ }).click();
await page.getByText(/AI недоступний/).waitFor();
await page.getByRole("button", { name: /Оновити/ }).click();
await page.getByText("🏆 Weekly Review").waitFor();
await shot("weekly-review");
ok("full review: score, metrics, best/worst day, analysis, next week; AI falls back to rules");

// Share card
await page.getByRole("button", { name: "Картка для соцмереж" }).click();
const img = modal().getByRole("img", { name: /Картка тижня/ });
await img.waitFor();
expect((await img.getAttribute("src")).startsWith("data:image/png"), "card preview is a PNG");
const saveCard = async (name) => {
  const [dl] = await Promise.all([page.waitForEvent("download"), modal().getByRole("button", { name: "Завантажити" }).click()]);
  if (SHOTS) await dl.saveAs(`${SHOTS}/${name}.png`);
  return dl.suggestedFilename();
};
const storyName = await saveCard("card-story");
expect(/tyzhden-\d+-story\.png/.test(storyName), `story file name (${storyName})`);
await modal().getByRole("tab", { name: "Пост 4:5" }).click();
await modal().getByPlaceholder("@нік").fill("@lifeprogress");
const postName = await saveCard("card-post");
expect(postName.endsWith("-post.png"), "post file name");
const caption = await modal().getByLabel("Текст до посту").inputValue();
expect(caption.includes(`${expected}/100`) && caption.includes("#мійтиждень"), "caption with the weekly score");
expect(!caption.includes("Tired"), "caption has no private notes");
await shot("card-dialog");
await page.keyboard.press("Escape");
ok("share card: preview, Stories + post PNG, signature, caption without notes");

// Seen → banner gone
await page.goto(`${BASE}/`);
await page.getByText("Today's focus", { exact: false }).waitFor();
await page.waitForTimeout(500);
expect(!(await page.getByText("🏆 Тижневий підсумок готовий!").count()), "banner hidden after opening the review");
ok("banner disappears after the review was opened");

// Mobile
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
const mp = await m.newPage();
await mp.goto(`${BASE}/reviews/${target}`);
await mp.getByText("🏆 Weekly Review").waitFor();
expect(!(await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "no horizontal scroll on mobile");
await shot("weekly-mobile", mp);
ok("mobile layout");

await browser.close();
if (errors.length) { console.log("Page errors:\n" + errors.join("\n")); process.exit(1); }
console.log("\nWeekly Review: all steps passed.");
