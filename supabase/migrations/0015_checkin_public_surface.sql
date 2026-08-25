-- P4.1: the public-schema surface the check-in flow (`/check-in`) needs
-- to actually call 0014's engine from the app.
--
-- PostgREST only exposes `public`/`graphql_public` (confirmed live —
-- see schedule-variance.ts's and budget-variance.ts's top comments, and
-- 0014's own top comment). Everything 0014 added lives in `app` and is
-- reachable from triggers/views but not from `supabase.rpc()` or a
-- `.from()` query. This file is the deliberately small `public`-schema
-- surface that closes that gap — one RPC wrapper for the one genuine
-- write (get-or-create the current period's check-in), one view for the
-- one read that isn't just a plain table select. Everything else the
-- check-in flow needs (reading the check_ins row once its id is known,
-- writing goal_ratings, writing capacity_rating/note, flipping
-- submitted_at) is a normal table operation already covered by
-- check_ins_all/goal_ratings_*'s existing RLS — no wrapper needed for
-- those, per CLAUDE.md's "skipped where the RLS policy already is the
-- exact authorization surface wanted."
--
-- Both new objects are unprivileged relative to what already exists:
-- `app.ensure_current_checkin` is itself SECURITY DEFINER with its own
-- auth.uid() ownership check (0014), and already has EXECUTE granted to
-- `authenticated` — the wrapper below just gives that call a `public`
-- address, it doesn't grant anything new. Same idea for the view.
create or replace function public.ensure_current_checkin()
returns uuid
language sql
set search_path = public, app
as $$
  select app.ensure_current_checkin(auth.uid());
$$;

-- Deliberately NOT the same shape as v_financial_horizon (0012's `select
-- app.financial_horizon(p.id) from profiles p`, no extra filter): that
-- one relies solely on security_invoker + profiles_select RLS, and
-- profiles_select is intentionally broad — "auth.uid() IS NOT NULL",
-- not "id = auth.uid()" (confirmed live), because the rest of the app
-- needs to read *other* people's display_name/handle for shared goals.
-- A streak is personal in a way a display name isn't, so this view adds
-- its own `where p.id = auth.uid()` on top rather than inheriting that
-- breadth — CLAUDE.md's "add a filter where RLS alone is broader than
-- what the UI should allow" case, made concrete. Still security_invoker
-- (rule 3): the extra filter is belt-and-braces against this view ever
-- being queried with someone else's id in mind, not a replacement for
-- real RLS.
create or replace view public.v_checkin_streak
with (security_invoker = true) as
select
  p.id as user_id,
  app.checkin_streak(p.id) as streak
from profiles p
where p.id = auth.uid();

grant select on public.v_checkin_streak to authenticated;
