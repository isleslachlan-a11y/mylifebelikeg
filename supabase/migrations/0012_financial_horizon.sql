-- P3.6: app.financial_horizon() and a thin view over it, for the
-- timeline's financial-horizon overlay line — "a boundary: everything
-- beyond it is aspiration rather than plan."
--
-- Numbering: last committed migration is 0009; 0011 (P3.1's
-- v_timeline_items) is applied but not yet committed as a file in this
-- repo — see CLAUDE.md's Database section. 0010 stays reserved for
-- PHASE-3-REQUIREMENTS.MD's R2 (today()/timezone) fix, not yet written.
-- This file takes 0012, the next free slot.
--
-- Definition: the latest `affordable_from` among the viewer's own
-- *active*, *save_toward* goals — i.e. how far your currently-funded
-- commitments actually reach, given real capacity. `v_goal_affordability`
-- (Phase 2) already computes `affordable_from` per goal from
-- capacity/target/contributed-so-far; this is deliberately just an
-- aggregate over that, not a second, independently-drifting projection.
-- `spend_against` goals are excluded because `v_goal_affordability`
-- itself has no affordable-from concept for them (CLAUDE.md's Money
-- dashboard note, `006 affordability test`) — a spend_against goal
-- doesn't participate in "how far does my funding reach."
--
-- Returns null when there are no active funded goals with a computed
-- affordable_from: `max()` over an empty/all-null set is null by plain
-- SQL aggregate semantics, so this is automatic, not a special case
-- coded on top — matches "returns null when no active funded goals
-- exist... render nothing, not a line at epoch" exactly.
--
-- Not sanity-checked against supabase/local's throwaway-Postgres process
-- (same limitation 0009/0011 flagged — no committed 0001-0008 to lay
-- this on top of, and v_goal_affordability's own definition isn't
-- committed either). Review by hand against the real schema before
-- applying, per DEPLOYMENT.md.
--
-- SECURITY INVOKER on the view (default from Postgres 15+, explicit
-- here anyway) so it enforces the querying user's own RLS rather than
-- the view owner's, per CLAUDE.md rule 3. The function itself is
-- SECURITY DEFINER (matching app.today_for_user() and friends) because
-- it reads across goals/v_goal_affordability by a caller-supplied
-- user_id — the view above it is what a client actually queries, and
-- that view's own security_invoker is what keeps a caller from reading
-- anyone else's horizon: RLS on `profiles` still gates which `user_id`
-- rows the view itself returns.
create or replace function app.financial_horizon(p_user_id uuid default auth.uid())
returns date
language sql
stable
security definer
set search_path = public, app
as $$
  select max(ga.affordable_from)
  from v_goal_affordability ga
  join goals g on g.id = ga.goal_id
  where ga.owner_id = p_user_id
    and ga.funding = 'save_toward'
    and g.state = 'active'
    and g.deleted_at is null;
$$;

create or replace view public.v_financial_horizon
with (security_invoker = true) as
select
  p.id as user_id,
  app.financial_horizon(p.id) as horizon_date
from profiles p;

-- Explicit grant, not inherited — same reasoning as 0009/0011: nothing
-- here can see whether an earlier, uncommitted migration used ALTER
-- DEFAULT PRIVILEGES for future public views, so grant directly.
grant select on public.v_financial_horizon to authenticated;
