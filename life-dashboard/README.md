# Life Progress Dashboard

A private, personal operating system for long-term progress.
Open it and within ~10 seconds know **where you are**, **where you're going** and **what to do now**.

Core loop: **set goal → work → record action → see progress → get next focus → repeat.**

Stack: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth + RLS) · Recharts · optional Claude API.

---

## Features

| Page | What it does |
|---|---|
| **Dashboard** `/` | Date, overall progress, area cards, Today's Focus, today's tasks, weekly progress, recent activity, 14-day scores |
| **Area** `/areas/[id]` | Main goal, deadline, progress, categories, this week's goals (+ previous weeks), milestone goals, tasks, activity log |
| **Today / Day** `/day/[date]` | Planned tasks, completed actions, areas worked on, time, notes, daily score with a transparent breakdown and manual override |
| **Goals** `/goals` | Tasks (grouped by day, overdue first), weekly goals with week navigation and "carry over unfinished", milestone goals |
| **Calendar** `/calendar` | Month grid; every day shows its score as a number + colour band + tooltip |
| **History** `/history` | Timeline by day, week (weekly goals kept per week) and month |
| **Statistics** `/stats` | Overall progress over time, per-area trends, consistency (7/30/90 days), completed per week/month, effort per area |
| **Roadmap** `/roadmap` | Editable life stages (e.g. "Age 14 · Sep 2026 → Jul 2027") with outcomes linked to live area progress |
| **Settings** `/settings` | Display name, week start, daily score formula (weights), JSON export |

Everything is editable from the UI and stored in Supabase. Areas are data, not code: the "5 suggested areas"
(English, Gym, Renovation, Content, Other Projects) are just a starter template you can accept, edit or delete.

Mobile has its own layout with a bottom navigation bar and a central **+** button (task / activity / weekly goal / goal).

## How numbers are calculated

All of this lives in `src/lib/` and is covered by unit tests (`npm test`).

**Category progress** (`progress.ts`) — per category you choose:
- *Manual*: the % you set.
- *From goals*: completed ÷ total milestone goals linked to that category.
- *Combined*: average of both (falls back to manual when there are no goals).

**Area progress** — *Manual* = average of its categories (or a direct % if it has none), *From goals* = completed milestone goals in the area, *Combined* = average.
**Overall progress** = average of all non-archived areas.
**Weekly progress** = completed ÷ total weekly goals of that week (e.g. 2 / 4 = 50%). Weekly goals belong to a week, so history is never overwritten.

**Daily score** (`score.ts`), 0–100, only from real actions:

| Part (default weight) | Measures |
|---|---|
| Planned tasks done (40) | completed ÷ tasks planned for the day |
| Important tasks done (20) | completed ÷ high-priority tasks planned for the day |
| Areas worked on (25) | distinct areas with activity ÷ target (default 3) |
| Consistency (15) | share of the previous 3 days with any activity |

Parts with nothing to measure (e.g. no high-priority tasks) are skipped and the rest are rescaled, so a perfect day is always 100.
A day with no activity has no score. Weights, target and window are editable in Settings; any day can be overridden manually.

**Today's Focus** (`focus.ts`) — rule-based and always available: overdue items, today's unfinished tasks,
deadlines within 7 days, weekly goals behind pace, the weakest category in an area, areas without activity for 5+ days,
and "nothing planned today". Top 3 by priority are shown.
The **AI coach** button sends a compact summary to `/api/focus`, which asks Claude for 1–3 recommendations.
It only works when `ANTHROPIC_API_KEY` is set on the server; otherwise the rule-based list stays.

Completing a goal/task automatically records an activity for that day, so the day log, calendar, history and stats
all come from the same data.

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste `supabase/migrations/0001_init.sql` and run it (tables, indexes, row level security).
3. **Project Settings → API**: copy the Project URL and the anon/publishable key.
4. **Authentication → URL Configuration**: set Site URL to your app URL (e.g. `https://your-app.vercel.app`) and add
   `https://your-app.vercel.app/auth/callback` to Redirect URLs.

### 2. Run locally
```bash
cd life-dashboard
cp .env.example .env.local   # fill in the Supabase values
npm install
npm run dev                  # http://localhost:3000
```

### 3. Deploy to Vercel
Import the repository, set **Root Directory = `life-dashboard`**, add the env vars from `.env.example`, deploy.

### 4. Make it private
1. Open the app and create your account (first-time link on the login page).
2. In Supabase **Authentication → Providers → Email**, turn off **Allow new users to sign up**.
3. Optionally set `ALLOWED_EMAILS=you@example.com` — the proxy then rejects any other account.

Every table has RLS (`user_id = auth.uid()`), so even with a leaked anon key nobody can read your data.

### Environment variables
| Name | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon / publishable key |
| `ALLOWED_EMAILS` | no | Comma-separated allow-list |
| `ANTHROPIC_API_KEY` | no | Enables the AI coach |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-5` |

## Data model

```
auth.users
 ├─ user_settings        (1:1)  display name, score formula, week start
 ├─ areas                        name, icon, colour, main goal, deadline, progress mode
 │   ├─ categories               progress, mode, target, deadline, notes
 │   ├─ goals                    kind = goal | weekly | task, priority, deadline, week_start, scheduled_for, completed
 │   └─ progress_snapshots       one row per area per day (for charts)
 ├─ daily_logs                   one per day: notes, manual score
 ├─ activities                   what was done: date, area, category, minutes, goal (auto for completed goals)
 └─ roadmap_stages → roadmap_items (optionally linked to an area)
```

## Project structure
```
src/
  app/(app)/…        authenticated pages (client components)
  app/login          sign in / create account
  app/api/focus      optional AI recommendations
  app/auth/callback  email confirmation
  proxy.ts           session refresh + route protection (Next 16 "proxy", formerly middleware)
  components/        UI kit, editors (all create/edit dialogs), shell & navigation
  lib/               types, dates, progress, score, focus rules, Supabase store
supabase/migrations  database schema
scripts/             local test stack + end-to-end flow
```

## Testing
```bash
npm test          # unit tests: progress, weekly, daily score, focus rules
npm run lint
npm run typecheck
```

End-to-end (`scripts/e2e/flow.mjs`) runs the full acceptance flow in a real browser: create account → area →
categories → progress → weekly goal → complete → tasks & activity → daily score → calendar → history → stats →
roadmap & settings → edit goal → refresh → everything persisted → mobile layout → second account (template,
data isolation, AI fallback) → sign out.

It can run against a real Supabase project, or fully offline with the local stand-in in `scripts/local-stack`
(a small server that implements the subset of Supabase Auth + REST this app uses, on top of a real Postgres
with the real migration and RLS):

```bash
createdb lifedash
psql lifedash -f scripts/local-stack/auth-stub.sql -f supabase/migrations/0001_init.sql
DATABASE_URL=postgres://localhost/lifedash npm run stack:local          # :54321
# .env.local: NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321, NEXT_PUBLIC_SUPABASE_ANON_KEY=local
npm run build && npm start
npm run e2e
```

## Designed to grow
Not built yet, but the structure leaves room for: streaks & achievements (from `activities` / scores),
AI weekly/monthly reviews (same pattern as `/api/focus`), notifications, widgets, integrations, multiple dashboards
(add a `dashboard_id` to `areas`), and more export formats.
