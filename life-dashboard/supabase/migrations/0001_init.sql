-- Life Progress Dashboard — initial schema
-- Every table is owned by a user (user_id defaults to auth.uid()) and protected by RLS.

create extension if not exists pgcrypto;

-- ───────────────────────── user settings ─────────────────────────
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text,
  -- Daily score weights & options. Edited from Settings → Daily score.
  score_config jsonb not null default '{
    "weights": {"planned": 40, "important": 20, "coverage": 25, "consistency": 15},
    "coverageTarget": 3,
    "consistencyDays": 3
  }'::jsonb,
  week_starts_on smallint not null default 1 check (week_starts_on in (0, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── areas ─────────────────────────
create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  icon text not null default '⭐',
  color text not null default '#3987e5',
  description text,
  main_goal text,
  deadline date,
  -- manual: from categories (or manual_progress when there are none)
  -- tasks:  share of completed milestone goals in the area
  -- mixed:  average of the two
  progress_mode text not null default 'manual' check (progress_mode in ('manual', 'tasks', 'mixed')),
  manual_progress smallint not null default 0 check (manual_progress between 0 and 100),
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists areas_user_idx on public.areas (user_id, position);

-- ───────────────────────── categories ─────────────────────────
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  area_id uuid not null references public.areas (id) on delete cascade,
  name text not null,
  progress smallint not null default 0 check (progress between 0 and 100),
  progress_mode text not null default 'manual' check (progress_mode in ('manual', 'tasks', 'mixed')),
  target text,
  deadline date,
  notes text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists categories_area_idx on public.categories (area_id, position);

-- ───────────────────────── goals (goals, weekly objectives, daily tasks) ─────────────────────────
-- kind = 'goal'   → milestone goal with optional deadline (drives task-based progress)
-- kind = 'weekly' → weekly objective, belongs to week_start (history is kept per week)
-- kind = 'task'   → task planned for a specific day (scheduled_for), drives the daily score
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  area_id uuid references public.areas (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  kind text not null default 'goal' check (kind in ('goal', 'weekly', 'task')),
  title text not null,
  notes text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  deadline date,
  week_start date,
  scheduled_for date,
  completed boolean not null default false,
  completed_at timestamptz,
  completed_on date,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint weekly_has_week check (kind <> 'weekly' or week_start is not null)
);
create index if not exists goals_user_kind_idx on public.goals (user_id, kind);
create index if not exists goals_area_idx on public.goals (area_id);
create index if not exists goals_week_idx on public.goals (user_id, week_start);

-- ───────────────────────── daily logs & activities ─────────────────────────
create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  notes text,
  manual_score smallint check (manual_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- One row per recorded action. Completing a goal/task creates one automatically (goal_id set).
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  area_id uuid references public.areas (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  goal_id uuid references public.goals (id) on delete cascade,
  description text not null,
  minutes integer check (minutes is null or minutes >= 0),
  created_at timestamptz not null default now()
);
create index if not exists activities_user_date_idx on public.activities (user_id, date);

-- ───────────────────────── progress snapshots (for charts over time) ─────────────────────────
create table if not exists public.progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  area_id uuid not null references public.areas (id) on delete cascade,
  date date not null,
  progress smallint not null check (progress between 0 and 100),
  unique (user_id, area_id, date)
);

-- ───────────────────────── roadmap ─────────────────────────
create table if not exists public.roadmap_stages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  subtitle text,
  start_date date,
  end_date date,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stage_id uuid not null references public.roadmap_stages (id) on delete cascade,
  area_id uuid references public.areas (id) on delete set null,
  title text not null,
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- ───────────────────────── row level security ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'user_settings', 'areas', 'categories', 'goals', 'daily_logs',
    'activities', 'progress_snapshots', 'roadmap_stages', 'roadmap_items'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
