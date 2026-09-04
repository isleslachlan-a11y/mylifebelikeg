-- P9.0: found by the isolation suite. `v_financial_horizon` selects
-- from `profiles` with no filter of its own, relying entirely on that
-- table's RLS to narrow the result -- but `profiles_select` is
-- deliberately broad by design (P7.3: "any signed-in user, any
-- non-deleted row" -- the same policy that legitimately lets one user
-- view another's basic profile page). This view inherited that
-- broadness for something that was never meant to be broad: every
-- signed-in user's own financial-horizon *date* -- itself derived from
-- `v_goal_affordability`, which is derived from private cashflow/pot
-- data -- was readable by any other signed-in user via a direct,
-- unfiltered query against this view.
--
-- Confirmed live before writing this fix, not assumed: the one real
-- caller (`src/app/(app)/timeline/page.tsx`) always adds its own
-- `.eq("user_id", userId)`, which is exactly why this was never visible
-- through the app's own UI -- and exactly the wrong kind of safety to
-- rely on. "Nothing about their money... holds by construction" is
-- CLAUDE.md's own standing rule for profile-adjacent surfaces
-- (P7.3) -- this view broke that construction, the app-code discipline
-- just happened to paper over it.
--
-- Every other per-user view in this schema (v_someday_progress,
-- v_pot_balances, etc.) doesn't need this because its *base* table
-- already has a strict `user_id = auth.uid()` policy with no broad-read
-- exception -- `profiles` is the one table in this schema where that
-- assumption doesn't hold, which is exactly why this view needs its own
-- explicit filter rather than trusting the table underneath it.
create or replace view public.v_financial_horizon
with (security_invoker = true) as
select
  id as user_id,
  app.financial_horizon(id) as horizon_date
from profiles
where id = auth.uid();

do $$
begin
  assert (
    select pg_get_viewdef('public.v_financial_horizon'::regclass, true) ilike '%where id = auth.uid()%'
  ), 'v_financial_horizon should filter to auth.uid() after this migration';
end $$;
