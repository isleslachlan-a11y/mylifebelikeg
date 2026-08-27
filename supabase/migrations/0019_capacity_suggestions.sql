-- P4.5: capacity suggestions at /settings/capacity.
--
-- Two more public-schema wrappers, same reason 0015/0016 needed them:
-- app.suggest_goal_limit_change and app.current_checkin_period both
-- live in `app`, which PostgREST doesn't expose. current_checkin_period
-- is needed here (not just by the check-in flow) so a dismissed
-- suggestion can be tied to "this period" — the brief's own phrase for
-- how long a dismissal lasts — without recomputing the period in JS
-- (the exact thing 0014's top comment already warns against).
create or replace function public.suggest_goal_limit_change()
returns table (direction text, reason text, current_limit smallint)
language sql
set search_path = public, app
as $$
  select * from app.suggest_goal_limit_change(auth.uid());
$$;

create or replace function public.current_checkin_period()
returns table (period_start date, period_end date)
language sql
set search_path = public, app
as $$
  select * from app.current_checkin_period(auth.uid());
$$;

-- Dismissing a suggestion (brief: "doesn't reappear for that period")
-- doesn't change what app.suggest_goal_limit_change computes — it's
-- still there, still true — this just records that the user has already
-- seen and dismissed it for the current period, so the UI can suppress
-- it without the underlying advice changing. One row per user per
-- period; re-dismissing the same period is a no-op, not a duplicate.
create table public.capacity_suggestion_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  created_at timestamptz not null default now(),
  unique (user_id, period_start)
);

alter table public.capacity_suggestion_dismissals enable row level security;

-- Personal, not goal-scoped — same shape as check_ins_all, since a
-- capacity suggestion is about the user, not any one goal.
create policy capacity_suggestion_dismissals_all
  on public.capacity_suggestion_dismissals
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
