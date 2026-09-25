// End-to-end check of the core loop against a running app (see README → "Testing").
//   BASE_URL=http://localhost:3000 SHOTS=./shots node scripts/e2e/flow.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
const email = `owner+${Date.now()}@example.com`;
const password = "correct-horse-1";
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

let step = 0;
const ok = (msg) => console.log(`✔ ${++step}. ${msg}`);
const expect = (cond, msg) => { if (!cond) throw new Error(`FAILED: ${msg}`); };
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const shot = async (name, p = page) => SHOTS && (await p.waitForTimeout(900), p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }));
const modal = () => page.locator("dialog[open]");
const save = async () => { await modal().getByRole("button", { name: "Save" }).click(); await modal().waitFor({ state: "detached" }).catch(() => {}); await page.waitForFunction(() => !document.querySelector("dialog[open]")); };

process.on("uncaughtException", async (e) => {
  console.error(e.message);
  await shot("failure").catch(() => {});
  console.error("Browser errors:\n" + errors.join("\n"));
  process.exit(1);
});

// 1. Create an account
await page.goto(`${BASE}/`);
expect(page.url().includes("/login"), "unauthenticated user is redirected to /login");
await page.getByRole("button", { name: /Create the owner account/ }).click();
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Create account" }).click();
await page.getByText("Set up your areas").waitFor();
ok("account created, empty dashboard shown");

// 2. Create an area
await page.getByRole("button", { name: "Create my own" }).click();
await modal().getByLabel("Icon (emoji)").fill("🇬🇧");
await modal().getByLabel("Name").fill("English");
await modal().getByLabel("Main goal").fill("Reach B2");
await modal().getByLabel("Deadline").fill("2027-06-30");
await save();
await page.getByRole("link", { name: /English/ }).first().waitFor();
ok("area created");

// second area for coverage
await page.getByRole("button", { name: "Add" }).first().click().catch(() => {});
await page.keyboard.press("Escape");
await page.goto(`${BASE}/areas`);
await page.getByRole("button", { name: "New area" }).click();
await modal().getByLabel("Icon (emoji)").fill("🏋️");
await modal().getByLabel("Name").fill("Gym");
await save();

// 3–4. Create categories and set progress
await page.goto(`${BASE}/`);
await page.locator("main").getByRole("link", { name: /English/ }).first().click();
await page.getByRole("heading", { name: /ENGLISH/ }).waitFor();
const areaUrl = page.url();
for (const [name, value] of [["Speaking", 20], ["Grammar", 40], ["Reading", 80]]) {
  await page.getByRole("button", { name: "Category" }).click();
  await modal().getByLabel("Name").fill(name);
  await modal().getByLabel("Current progress").fill(String(value));
  await save();
}
await page.getByRole("button", { name: /Edit Speaking, 20%/ }).waitFor();
const ringText = await page.locator("main").getByText(/^\d+%$/).first().textContent();
expect(ringText === "47%", `area progress is the category average (got ${ringText})`);
ok("categories created with progress; area progress = 47%");

// 5. Weekly goal
await page.getByRole("button", { name: "Weekly" }).click();
await modal().getByLabel("Title").fill("Practice speaking 3 times");
await save();
await page.getByText("Practice speaking 3 times").waitFor();
await page.getByRole("button", { name: "Weekly" }).click();
await modal().getByLabel("Title").fill("Complete 2 grammar lessons");
await save();
ok("weekly goals created (0 / 2)");

// 6. Complete it
await page.getByRole("checkbox", { name: /Mark done: Practice speaking 3 times/ }).click();
await page.getByRole("checkbox", { name: /Mark not done: Practice speaking 3 times/ }).waitFor();
expect(await page.getByText("1 / 2").first().isVisible(), "weekly progress 1 / 2");
ok("weekly goal completed → 1 / 2 (50%)");

// 7. Daily activity: a planned task done + a logged activity with time
await page.goto(`${BASE}/day/${today}`);
await page.getByRole("button", { name: "Task" }).click();
await modal().getByLabel("Title").fill("40 min speaking");
await modal().getByLabel("Area").selectOption({ label: "🇬🇧 English" });
await modal().getByLabel("Priority").selectOption("high");
await save();
await page.getByRole("button", { name: "Task" }).click();
await modal().getByLabel("Title").fill("Edit video");
await save();
await page.getByRole("checkbox", { name: /Mark done: 40 min speaking/ }).click();
await page.getByRole("checkbox", { name: /Mark not done: 40 min speaking/ }).waitFor();
await page.getByRole("button", { name: "Log" }).click();
await modal().getByLabel("What did you do?").fill("Workout");
await modal().getByLabel("Area").selectOption({ label: "🏋️ Gym" });
await modal().getByLabel("Minutes (optional)").fill("60");
await save();
await page.getByLabel("Notes").fill("Felt tired but still worked.");
await page.getByRole("button", { name: "Save notes" }).click();
await page.getByText("· saved").waitFor();
ok("tasks planned/completed, activity logged, notes saved");

// 8. Daily score
const scoreText = (await page.locator("main").getByText(/^\d+$/).first().textContent())?.trim();
// planned 1/2 (40), important 1/1 (20), coverage 2/3 (25), consistency 0/3 (15) → (20+20+16.7+0)/100 = 57
expect(scoreText === "57", `daily score is calculated from actions (got ${scoreText})`);
await page.getByPlaceholder("Use calculated score").fill("92");
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.getByText("· set manually").first().waitFor();
await page.getByRole("button", { name: "Reset" }).click();
await page.getByText("Medium", { exact: true }).waitFor();
ok(`daily score calculated = ${scoreText}; manual override saved and reset`);
await shot("day");

// 9. Calendar
await page.goto(`${BASE}/calendar`);
const cell = page.getByRole("link", { name: new RegExp(`score ${scoreText}`) });
await cell.waitFor();
await shot("calendar");
await cell.click();
await page.waitForURL(`**/day/${today}`);
ok("calendar shows the score and opens the day");

// 10. History
await page.goto(`${BASE}/history`);
await page.getByText("Workout").first().waitFor();
await page.getByRole("tab", { name: "Weeks" }).click();
await page.getByText("Practice speaking 3 times").waitFor();
await page.getByRole("tab", { name: "Months" }).click();
await page.getByText("active days").first().waitFor();
ok("history by day / week / month");

// 11. Statistics
await page.goto(`${BASE}/stats`);
await page.getByText("How consistent am I?").waitFor();
await page.getByText("1/30").waitFor();
await shot("stats");
ok("statistics render from real data");

// Roadmap + settings
await page.goto(`${BASE}/roadmap`);
await page.getByRole("button", { name: "Add first stage" }).click();
await modal().getByLabel("Title", { exact: true }).fill("Age 14");
await save();
await page.getByRole("button", { name: "Outcome" }).click();
await modal().getByLabel("Outcome").fill("Reach B2 English");
await modal().getByLabel(/Linked area/).selectOption({ label: "🇬🇧 English" });
await save();
await page.getByText("Reach B2 English").waitFor();
await page.goto(`${BASE}/settings`);
await page.getByLabel(/Planned tasks done/).fill("50");
await page.getByRole("button", { name: "Save formula" }).click();
await page.getByText("Saved").waitFor();
ok("roadmap stage + outcome created; score formula edited");

// 12. Edit the goal
await page.goto(areaUrl);
await page.getByRole("button", { name: "Edit Practice speaking 3 times" }).click();
await modal().getByLabel("Title").fill("Practice speaking 4 times");
await modal().getByLabel("Priority").selectOption("high");
await save();
await page.getByText("Practice speaking 4 times", { exact: true }).waitFor();
ok("goal edited");

// 13–14. Refresh and confirm persistence
await page.reload();
await page.getByText("Practice speaking 4 times", { exact: true }).waitFor();
expect(await page.getByRole("checkbox", { name: /Mark not done: Practice speaking 4 times/ }).isVisible(), "completion persisted");
expect(await page.getByRole("button", { name: /Edit Reading, 80%/ }).isVisible(), "category progress persisted");
expect(!(await page.getByText("Practice speaking 3 times").count()), "activity log follows the renamed goal");
await page.goto(`${BASE}/day/${today}`);
expect((await page.getByLabel("Notes").inputValue()) === "Felt tired but still worked.", "notes persisted");
await page.getByText("Workout").waitFor();
await page.goto(`${BASE}/settings`);
expect((await page.getByLabel(/Planned tasks done/).inputValue()) === "50", "settings persisted");
await page.goto(`${BASE}/roadmap`);
await page.getByText("Reach B2 English").waitFor();
await page.goto(`${BASE}/`);
await page.getByText("Today's focus", { exact: false }).waitFor();
await shot("dashboard");
ok("after refresh everything is still there");

// Mobile layout
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
const mp = await m.newPage();
await mp.goto(`${BASE}/`);
await mp.getByText("Today's focus", { exact: false }).waitFor();
expect(await mp.getByRole("button", { name: "Add" }).isVisible(), "mobile bottom nav visible");
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
expect(!overflow, "no horizontal scroll on mobile");
await shot("mobile-dashboard", mp);
await mp.goto(`${BASE}/calendar`);
await shot("mobile-calendar", mp);
await mp.goto(areaUrl);
await shot("mobile-area", mp);
ok("mobile layout with bottom navigation, no horizontal overflow");

// Second account: starter template, data isolation (RLS) and AI fallback
const c2 = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const p2 = await c2.newPage();
await p2.goto(`${BASE}/login`);
await p2.getByRole("button", { name: /Create the owner account/ }).click();
await p2.getByLabel("Email").fill(`second+${Date.now()}@example.com`);
await p2.getByLabel("Password").fill(password);
await p2.getByRole("button", { name: "Create account" }).click();
await p2.getByRole("button", { name: "Use the 5 suggested areas" }).click();
await p2.getByText("Today's focus", { exact: false }).waitFor();
const cards = await p2.locator('section[aria-label="Areas"] a').count();
expect(cards === 5, `template creates 5 areas (got ${cards})`);
expect(!(await p2.getByText("Workout").count()), "second account cannot see the first account's data");
await p2.getByRole("button", { name: /AI coach/ }).click();
await p2.getByText(/Showing rule-based focus/).waitFor();
await p2.goto(`${BASE}/roadmap`);
await p2.getByRole("heading", { name: "AGE 14" }).waitFor();
await c2.close();
ok("template (5 areas + roadmap), per-user isolation, AI falls back to rules without a key");

// Sign out → private again
await page.goto(`${BASE}/settings`);
await page.getByRole("button", { name: "Sign out", exact: true }).click();
await page.waitForURL("**/login");
await page.goto(`${BASE}/stats`);
expect(page.url().includes("/login"), "signed-out user cannot open the dashboard");
ok("sign out; dashboard is private again");

const relevant = errors.filter((e) => !e.includes("favicon"));
if (relevant.length) console.log("Browser errors:\n" + relevant.join("\n"));
await browser.close();
console.log(relevant.length ? "\nDone with browser errors." : "\nAll steps passed.");
process.exit(relevant.length ? 1 : 0);
