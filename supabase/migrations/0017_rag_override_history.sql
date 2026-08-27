-- P4.3: override history. Unlike 0014/0015/0016, this is genuinely new
-- work, not catching the repo up on something already live — the two
-- expiry mechanisms (`rag_override_expires_at` passing;
-- `app.on_checkin_submitted` clearing a stale override, both 0014) stay
-- untouched. What's missing is a record of *past* overrides: `goals`
-- only ever has room for the current one, so once it's replaced or
-- cleared, who/when/why is gone. This adds a table plus one trigger
-- that observes `goals.rag_override` changes and logs them — it doesn't
-- touch, wrap, or duplicate either existing mechanism.
--
-- Every write to `goals.rag_override` in this app goes through exactly
-- two code paths: this phase's new override-setting server action
-- (always sets a non-null override — override_needs_reason requires a
-- reason and expiry alongside it, so a "set" is never partial), and
-- `app.on_checkin_submitted` (0014, only ever *nulls* a stale override).
-- No third path exists, so the trigger below can tell them apart with
-- certainty from the values alone — new.rag_override is null means the
-- check-in trigger did it, non-null means a fresh override was set —
-- without needing a session flag or trigger-depth check to disambiguate.
create table public.rag_override_history (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  status public.rag_status not null,
  reason text not null,
  set_by uuid not null references public.profiles(id),
  set_at timestamptz not null,
  expires_at timestamptz not null,
  -- Only ever set by the trigger below, to `now()` at the moment this
  -- entry stopped being the goal's live override. Naturally null for
  -- the current entry (if any) until it's replaced or cleared —
  -- *expiring* (expires_at passing) is deliberately not one of these
  -- events: nothing writes to this table when a timestamp merely
  -- passes, so an expired-but-not-yet-superseded override reads as
  -- ended_at is null with expires_at < now() at query time, not as a
  -- third ended_reason value.
  ended_at timestamptz,
  ended_reason text check (ended_reason in ('replaced', 'cleared_by_checkin')),
  created_at timestamptz not null default now()
);

create index rag_override_history_goal_idx
  on public.rag_override_history (goal_id, set_at desc);

alter table public.rag_override_history enable row level security;

-- Same authorization surface as rag_snapshots_select (0014) — whoever
-- can see the goal can see its override history. No insert/update
-- policy: the trigger below is the only writer, running SECURITY
-- DEFINER as the table owner, which bypasses RLS the same way every
-- other write-only-via-function table in this schema already does.
create policy rag_override_history_select on public.rag_override_history
  for select using (app.can_view_goal(goal_id));

create or replace function app.log_rag_override_change()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if old.rag_override is not distinct from new.rag_override
     and old.rag_override_at is not distinct from new.rag_override_at then
    return new;
  end if;

  -- Close out whatever was open before this update. new.rag_override
  -- being null here can only mean app.on_checkin_submitted did this
  -- (see this file's top comment); non-null means a fresh override
  -- just overwrote a still-live one.
  if old.rag_override is not null then
    update rag_override_history
       set ended_at = now(),
           ended_reason = case
             when new.rag_override is null then 'cleared_by_checkin'
             else 'replaced'
           end
     where goal_id = new.id and ended_at is null;
  end if;

  if new.rag_override is not null then
    insert into rag_override_history
      (goal_id, status, reason, set_by, set_at, expires_at)
    values
      (new.id, new.rag_override, new.rag_override_reason,
       new.rag_override_by, new.rag_override_at, new.rag_override_expires_at);
  end if;

  return new;
end;
$$;

create trigger goals_log_rag_override
after update of rag_override on public.goals
for each row execute function app.log_rag_override_change();
