-- Weekly Review: one saved review per user per week.
-- Safe to run more than once.

create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  -- Rounded average of the daily scores of that week; null when no day had a score.
  score smallint check (score is null or score between 0 and 100),
  -- Snapshot of the numbers the review was built from (days, areas, best/worst day, …).
  stats jsonb not null default '{}'::jsonb,
  summary text,
  recommendations jsonb not null default '[]'::jsonb,
  -- 'ai' when written by Claude, 'rules' for the built-in fallback.
  source text not null default 'rules' check (source in ('ai', 'rules')),
  -- false while the week is still running (review prepared on its last evening);
  -- becomes true once it is rebuilt after the week has fully ended.
  final boolean not null default true,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create index if not exists weekly_reviews_user_idx on public.weekly_reviews (user_id, week_start desc);

alter table public.weekly_reviews enable row level security;
drop policy if exists "owner_all" on public.weekly_reviews;
create policy "owner_all" on public.weekly_reviews for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.weekly_reviews to authenticated;
